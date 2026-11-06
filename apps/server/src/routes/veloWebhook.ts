// POST /webhooks/velo — Velo's signed events. Verified against the RAW body before anything is trusted.
import express, { Router } from 'express';
import { Velo, VeloWebhookSignatureVerificationError } from '@carts1024/velo-sdk';
import type { AppContext } from '../context';
import { env } from '../env';

/** Prefix the SDK uses when the signature matched but the body failed its strict shape check. */
const SHAPE_ERROR = 'Invalid webhook event:';

export function veloWebhookRoute(ctx: AppContext): Router {
  const r = Router();

  r.post('/webhooks/velo', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!env.VELO_WEBHOOK_SECRET) return res.status(503).send('VELO_WEBHOOK_SECRET not set');
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const sig = req.headers['x-velo-signature'];
    const delivery = String(req.headers['x-velo-delivery'] ?? '');

    // 1. Signature, always through the SDK. Its shape check runs only AFTER the HMAC matched, so a
    //    SHAPE_ERROR still means the body is authentic. The Velo dashboard currently sends a flatter
    //    body ({ id, type, paymentIntentId, projectId, test }) than the SDK's types describe.
    let type: string;
    let eventId: string;
    let intentId: string | undefined;
    let sdkEvent: Awaited<ReturnType<typeof Velo.webhooks.verify>> | undefined;
    try {
      sdkEvent = await Velo.webhooks.verify({ payload, signature: Array.isArray(sig) ? sig[0] : sig ?? null, secret: env.VELO_WEBHOOK_SECRET });
      type = sdkEvent.type;
      eventId = sdkEvent.id;
      intentId = 'paymentIntent' in sdkEvent ? sdkEvent.paymentIntent.id : undefined;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const authenticShape = err instanceof VeloWebhookSignatureVerificationError && reason.startsWith(SHAPE_ERROR);
      if (!authenticShape) {
        // Log why (never the secret or signature), so a failed delivery can be diagnosed from Render's logs.
        const headers = Object.keys(req.headers).filter((h) => h.startsWith('x-velo') || h.includes('signature'));
        console.error(JSON.stringify({ kind: 'webhook_rejected', reason, headers, bytes: payload.length }));
        return res.status(400).send(`bad signature: ${reason}`);
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return res.status(400).send('invalid: body is not JSON');
      }
      type = String(body.type ?? '');
      eventId = String(body.id ?? '');
      const pi = body.paymentIntent as { id?: unknown } | undefined;
      intentId = typeof pi?.id === 'string' ? pi.id : typeof body.paymentIntentId === 'string' ? body.paymentIntentId : undefined;
      console.log(JSON.stringify({ kind: 'webhook_flat_body', type, sdkReason: reason }));
    }

    const key = delivery || eventId;
    if (key && ctx.store.hasDelivery(key)) return res.status(200).send('duplicate');
    if (key) ctx.store.addDelivery(key);

    // 2. Act on it. Amounts and payer come from Velo's API, not from the webhook body.
    try {
      if (type === 'payment.succeeded' && intentId) {
        if (!ctx.store.trancheByIntent(intentId)) {
          console.log(JSON.stringify({ kind: 'webhook_unknown_intent', intentId }));
          return res.status(200).send('ok (no matching top-up)');
        }
        const info = await ctx.velo.retrieve(intentId);
        if (info.status !== 'paid') return res.status(200).send(`ok (intent is ${info.status})`);
        const txHash = sdkEvent && 'paymentIntent' in sdkEvent ? sdkEvent.paymentIntent.txHash : undefined;
        await ctx.topups.onIntentPaid(intentId, 'webhook', { amount: info.amount, payerAddress: info.payerAddress, txHash: txHash ?? undefined });
      } else if (type === 'payment.failed' && intentId) {
        const t = ctx.store.trancheByIntent(intentId);
        if (t && t.status === 'REQUESTED') ctx.store.updateTranche(t.id, { status: 'FAILED', error: 'Velo reported the payment failed' });
      } else if (sdkEvent && sdkEvent.type === 'contract.event' && 'contractId' in sdkEvent) {
        ctx.store.addEvent({ id: `velo-${sdkEvent.id}`, type: `velo ${sdkEvent.type}`, ledger: sdkEvent.ledger, at: sdkEvent.sentAt, txHash: sdkEvent.transactionHash, source: 'velo' });
      }
      return res.status(200).send('ok');
    } catch (err) {
      console.error('webhook handler error', err);
      return res.status(200).send('logged'); // our bug: don't make Velo retry forever
    }
  });

  return r;
}
