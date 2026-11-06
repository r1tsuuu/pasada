// GET /api/health, /api/config, /api/state — everything the website reads.
import { Router } from 'express';
import { weeklyUsedLiters, lastFill } from '@pasada/agent';
import { EXPLORER_BASE, NOIR_CONTRACTS, PROGRAM, lowBalanceThresholdStroops, perFillCapStroops } from '@pasada/shared';
import type { ApiConfig, ApiState, ApiStationState, ApiVehicleState } from '@pasada/shared';
import type { AppContext } from '../context';
import { env } from '../env';
import { decisionJson, eventJson, heldJson, money, trancheJson } from '../serialize';

const DAY_MS = 86_400_000;

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export function stateRoutes(ctx: AppContext): Router {
  const r = Router();
  const contracts = ctx.chain.mode === 'testnet' ? (ctx.chain as unknown as { contracts: typeof NOIR_CONTRACTS }).contracts : NOIR_CONTRACTS;

  r.get('/api/health', (_req, res) => {
    res.json({ ok: true, network: 'testnet', mode: ctx.chain.mode, contracts, velo: ctx.velo.configured ? 'configured' : 'missing VELO_API_KEY', time: new Date().toISOString() });
  });

  r.get('/api/config', (_req, res) => {
    const body: ApiConfig = {
      mode: ctx.chain.mode,
      program: {
        name: PROGRAM.name,
        subsidyPerLiter: money(PROGRAM.subsidyStroopsPerLiter),
        phpPerXlmDemoRate: PROGRAM.phpPerXlmDemoRate,
        weeklyCapLiters: PROGRAM.weeklyCapLiters,
        refillWindowMinutes: PROGRAM.refillWindowMinutes,
        programEndsAt: PROGRAM.programEndsAt.toISOString(),
      },
      vehicles: ctx.vehicles.map((v) => ({
        id: v.id, plate: v.plate, route: v.route, tankLiters: v.tankLiters, deviceHash: v.deviceHash,
        agentPublicKey: v.agentPublicKey, perFillCap: money(perFillCapStroops(v)),
      })),
      stations: ctx.stations.map((s) => ({ id: s.id, name: s.name, accredited: s.accredited, publicKey: s.publicKey })),
      programOwnerPublicKey: ctx.ownerPublicKey,
      contracts,
      explorerBase: EXPLORER_BASE,
      repoUrl: env.REPO_URL,
    };
    res.json(body);
  });

  r.get('/api/state', async (_req, res) => {
    const now = new Date();
    const { chain, store, cache } = ctx;

    const vehicles: ApiVehicleState[] = await Promise.all(
      ctx.vehicles.map(async (v) => {
        const [escrow, policy] = await Promise.all([
          safe(cache.get(`escrow:${v.id}`, () => chain.getEscrowBalance(v.deviceHash))),
          safe(cache.get(`policy:${v.id}`, () => chain.getPolicy(v.deviceHash))),
        ]);
        const history = store.history(v.id);
        const threshold = lowBalanceThresholdStroops(v);
        const open = store.openTranche(v.id);
        return {
          id: v.id, plate: v.plate, route: v.route, tankLiters: v.tankLiters,
          escrow: escrow === null ? null : money(escrow),
          lowBalanceThreshold: money(threshold),
          isLow: escrow !== null && escrow < threshold,
          weeklyUsedLiters: weeklyUsedLiters(history, now),
          weeklyCapLiters: PROGRAM.weeklyCapLiters,
          lastFillAt: lastFill(history, now)?.at ?? null,
          policy: policy ? { maxAmount: money(policy.maxAmount), expiresAt: policy.expiresAt ? policy.expiresAt.toISOString() : null, agent: policy.agent } : null,
          openTrancheId: open?.id ?? null,
        };
      }),
    );

    const stations: ApiStationState[] = await Promise.all(
      ctx.stations.map(async (s) => {
        const pending = s.accredited ? await safe(cache.get(`pending:${s.id}`, () => chain.getPendingBalance(s.publicKey))) : 0n;
        const claimedToday = store.decisions
          .filter((d) => d.stationId === s.id && d.claimTxHash && now.getTime() - Date.parse(d.createdAt) < DAY_MS)
          .reduce((sum, d) => sum + d.amountStroops, 0n);
        return { id: s.id, name: s.name, accredited: s.accredited, publicKey: s.publicKey, pending: pending === null ? null : money(pending), claimedToday: money(claimedToday) };
      }),
    );

    const body: ApiState = {
      now: now.toISOString(),
      mode: chain.mode,
      vehicles,
      stations,
      decisions: store.decisions.slice(0, 50).map(decisionJson),
      held: [...store.held]
        .sort((a, b) => Number(b.status === 'NEEDS_REVIEW' || b.status === 'AWAITING_FUNDS') - Number(a.status === 'NEEDS_REVIEW' || a.status === 'AWAITING_FUNDS'))
        .slice(0, 30)
        .map(heldJson),
      tranches: store.tranches.slice(0, 20).map(trancheJson),
      events: store.events.slice(0, 100).map(eventJson),
    };
    res.json(body);
  });

  return r;
}
