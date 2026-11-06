// POST /api/fills — a driver tapped a jeepney card at a pump. The vehicle agent decides and pays.
// Plus the program's review of held fills and the "Agent: check balance" button.
import { Router } from 'express';
import type { AppContext } from '../context';
import { decisionJson, heldJson, trancheJson } from '../serialize';

export function fillRoutes(ctx: AppContext): Router {
  const r = Router();

  r.post('/api/fills', async (req, res) => {
    const { vehicleId, stationId, liters } = req.body ?? {};
    if (typeof vehicleId !== 'string' || typeof stationId !== 'string' || vehicleId.length > 8 || stationId.length > 8) {
      return res.status(400).json({ error: 'vehicleId and stationId are required' });
    }
    if (typeof liters !== 'number' || !Number.isFinite(liters)) {
      return res.status(400).json({ error: 'liters must be a number' });
    }
    const decision = await ctx.vehicleAgent.handleFill({ vehicleId, stationId, liters });
    ctx.cache.clear();
    res.json({ decision: decisionJson(decision) });
  });

  r.post('/api/held/:id/approve', async (req, res) => {
    const decision = await ctx.vehicleAgent.releaseHeld(req.params.id);
    if (!decision) return res.status(404).json({ error: 'No held fill waiting for review with that id' });
    ctx.cache.clear();
    res.json({ decision: decisionJson(decision) });
  });

  r.post('/api/held/:id/reject', (req, res) => {
    const held = ctx.vehicleAgent.rejectHeld(req.params.id);
    if (!held) return res.status(404).json({ error: 'No held fill waiting for review with that id' });
    res.json({ held: heldJson(held) });
  });

  r.post('/api/vehicles/:id/check-balance', async (req, res) => {
    try {
      const tranche = await ctx.vehicleAgent.checkBalance(req.params.id);
      res.json({ tranche: tranche ? trancheJson(tranche) : null });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return r;
}
