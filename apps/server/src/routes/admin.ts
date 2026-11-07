// Admin routes (header x-admin-token) and, in fake mode only, the local stand-in for Velo's checkout page.
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppContext } from '../context';
import { env } from '../env';
import { FakeVelo } from '../velo/client';
import { money } from '../serialize';
import { DemoVelo } from '../velo/demoVelo';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!env.ADMIN_TOKEN) return res.status(503).json({ error: 'ADMIN_TOKEN not set' });
  if (req.headers['x-admin-token'] !== env.ADMIN_TOKEN) return res.status(401).json({ error: 'bad admin token' });
  next();
}

export function adminRoutes(ctx: AppContext): Router {
  const r = Router();

  r.post('/api/admin/reset', requireAdmin, (_req, res) => {
    ctx.store.reset();
    ctx.cache.clear();
    res.json({ ok: true });
  });

  /** Program closes a vehicle: unlinkDevice sweeps the whole escrow back to the program wallet. */
  r.post('/api/admin/vehicles/:id/close', requireAdmin, async (req, res) => {
    const v = ctx.vehicles.find((x) => x.id === req.params.id);
    if (!v) return res.status(404).json({ error: 'unknown vehicle' });
    try {
      const out = await ctx.chain.unlinkDevice({ ownerSecret: ctx.ownerSecret, deviceHash: v.deviceHash });
      ctx.cache.clear();
      res.json({ hashes: out.hashes, escrowReturned: money(out.escrowReturned) });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- fake mode only: a local checkout page so the top-up loop can be tried offline ----
  if (ctx.velo instanceof FakeVelo) {
    const velo = ctx.velo;
    const demo = velo instanceof DemoVelo;
    r.get('/dev/checkout/:id', (req, res) => {
      const intent = velo.intents.get(req.params.id);
      if (!intent) return res.status(404).send('Unknown checkout');
      res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${demo ? 'Demo checkout' : 'Test checkout'}</title>
<body style="font-family:system-ui;max-width:420px;margin:48px auto;padding:0 16px;color:#1c2333">
<p style="color:#8a5a00;background:#fff4d6;padding:8px 12px;border-radius:8px">${demo ? "Demo checkout: stands in for Velo's hosted checkout. The server signs a real Testnet payment with a test key." : "Offline test checkout (fake mode). On Testnet this is Velo's hosted checkout."}</p>
<h1 style="font-size:22px">${intent.description}</h1>
<p style="font-size:32px;margin:8px 0">${intent.amount} XLM</p>
<p>Status: <b>${intent.status}</b></p>
<form method="post" action="/dev/checkout/${req.params.id}/pay"><button style="font-size:18px;padding:12px 20px;border-radius:10px;border:0;background:#1d4ed8;color:white">${demo ? 'Pay as treasurer' : 'Pay with test wallet'}</button></form>
<p><a href="${intent.cancelUrl}">Cancel</a></p></body>`);
    });
    r.post('/dev/checkout/:id/pay', async (req, res) => {
      try {
        const intent = await velo.pay(req.params.id);
        if (!intent) return res.status(404).send('Unknown checkout');
        res.redirect(intent.successUrl);
      } catch (err) {
        console.error('checkout payment failed', err instanceof Error ? err.message : err);
        res.status(502).send('Payment failed. Check the server log.');
      }
    });
  }

  return r;
}
