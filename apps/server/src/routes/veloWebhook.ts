// POST /webhooks/velo — Velo's signed events. Verified against the RAW body before anything is trusted.
import express, { Router } from 'express';
import { Velo, VeloWebhookSignatureVerificationError } from '@carts1024/velo-sdk';
import type { AppContext } from '../context';
import { env } from '../env';

export function veloWebhookRoute(ctx: AppContext): Router {
  const r = Router();

  r.post('/webhooks/velo', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!env.VELO_WEBHOOK_SECRET) return res.status(503).send('VELO_WEBHOOK_SECRET not set');
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const sig = req.headers['x-velo-signature'];
    const delivery = String(req.headers['x-velo-delivery'] ?? '');

    let event;
    try {
      event = await Velo.webhooks.verify({ payload, signature: Array.isArray(sig) ? sig[0] : sig ?? null, secret: env.VELO_WEBHOOK_SECRET });
    } catch (err) {
      if (err instanceof VeloWebhookSignatureVerificationError) return res.status(400).send('bad signature');
      console.error('webhook verify error', err);
      return res.status(400).send('invalid');
    }

    const key = delivery || event.id;
    if (ctx.store.hasDelivery(key)) return res.status(200).send('duplicate');
    ctx.store.addDelivery(key);

    try {
      if (event.type === 'payment.succeeded' && 'paymentIntent' in event) {
        const pi = event.paymentIntent;
        await ctx.topups.onIntentPaid(pi.id, 'webhook', { amount: pi.amount, payerAddress: pi.payerAddress ?? null, txHash: pi.txHash });
      } else if (event.type === 'payment.failed' && 'paymentIntent' in event) {
        const t = ctx.store.trancheByIntent(event.paymentIntent.id);
        if (t && t.status === 'REQUESTED') ctx.store.updateTranche(t.id, { status: 'FAILED', error: 'Velo reported the payment failed' });
      } else if (event.type === 'contract.event' && 'contractId' in event) {
        ctx.store.addEvent({ id: `velo-${event.id}`, type: `velo ${event.type}`, ledger: event.ledger, at: event.sentAt, txHash: event.transactionHash, source: 'velo' });
      }
      return res.status(200).send('ok');
    } catch (err) {
      console.error('webhook handler error', err);
      return res.status(200).send('logged'); // our bug: don't make Velo retry forever
    }
  });

  return r;
}
