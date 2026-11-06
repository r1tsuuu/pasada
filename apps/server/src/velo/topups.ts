// The vehicle agent's money requests: Velo checkout for a top-up, then — once Velo confirms the
// payment (signed webhook or status poll) — fund the jeepney's Noir escrow and retry held fills.
import { randomUUID } from 'node:crypto';
import { toStroops, fromStroops } from '@noirx402/agent-sdk';
import { planTopUp, withAccountLock } from '@pasada/agent';
import type { ChainPort, Logger, PasadaStore, VehicleAgent, VehicleRuntime } from '@pasada/agent';
import type { ProgramConfig, Tranche } from '@pasada/shared';
import type { VeloPort } from './client';

export interface TopUpsDeps {
  chain: ChainPort;
  store: PasadaStore;
  velo: VeloPort;
  program: ProgramConfig;
  vehicles: VehicleRuntime[];
  ownerSecret: string;
  ownerPublicKey: string;
  publicWebUrl: string;
  log: Logger;
}

export class TopUps {
  private agent: VehicleAgent | null = null;

  constructor(private readonly deps: TopUpsDeps) {}

  /** Wired after construction to avoid a circular dependency with the vehicle agent. */
  attachAgent(agent: VehicleAgent) {
    this.agent = agent;
  }

  /** Returns the vehicle's open top-up, or creates one sized by the agent's planner. */
  ensureTopUp = async (vehicle: VehicleRuntime, now: Date): Promise<Tranche | null> => {
    const { store, chain, velo, program, log } = this.deps;
    return withAccountLock(`topup:${vehicle.id}`, async () => {
      const open = store.openTranche(vehicle.id);
      if (open) return open;

      const balance = await chain.getEscrowBalance(vehicle.deviceHash);
      const held = store.openHeld(vehicle.id, 'AWAITING_FUNDS').reduce((s, h) => s + h.amountStroops, 0n);
      const plan = planTopUp({ vehicle, history: store.history(vehicle.id), balanceStroops: balance, heldStroops: held, now, program });

      const id = randomUUID();
      const nowIso = new Date().toISOString();
      const tranche: Tranche = {
        id, createdAt: nowIso, updatedAt: nowIso, vehicleId: vehicle.id, status: 'REQUESTED',
        amountStroops: plan.amountStroops, rationale: plan.rationale,
        plan: { dailyLiters: plan.dailyLiters, days: plan.days, requestLiters: plan.requestLiters, targetStroops: plan.targetStroops, balanceStroops: plan.balanceStroops, heldStroops: plan.heldStroops, amountStroops: plan.amountStroops },
        paymentIntentId: '', veloObjectId: '', checkoutUrl: '',
      };

      try {
        const checkout = await velo.createCheckout(
          {
            amount: fromStroops(plan.amountStroops),
            description: `Pasada top-up · ${vehicle.plate} · ${plan.requestLiters} L`,
            successUrl: `${this.deps.publicWebUrl}/?topup=${id}&result=success`,
            cancelUrl: `${this.deps.publicWebUrl}/?topup=${id}&result=cancel`,
          },
          `pasada-topup-${id}`,
        );
        tranche.paymentIntentId = checkout.paymentIntentId;
        tranche.veloObjectId = checkout.id;
        tranche.checkoutUrl = checkout.checkoutUrl;
        tranche.receiverAddress = checkout.receiverAddress;
        if (checkout.receiverAddress && checkout.receiverAddress !== this.deps.ownerPublicKey) {
          log({ kind: 'topup-receiver-differs', vehicle: vehicle.id, receiver: checkout.receiverAddress });
        }
      } catch (err) {
        tranche.status = 'FAILED';
        tranche.error = err instanceof Error ? err.message : String(err);
      }

      store.addTranche(tranche);
      log({ kind: 'topup', id, vehicle: vehicle.id, status: tranche.status, amountStroops: tranche.amountStroops, error: tranche.error });
      return tranche;
    });
  };

  /** Velo says a top-up's payment intent is paid. Runs at most once per top-up. */
  async onIntentPaid(intentId: string, via: 'webhook' | 'poll', details: { amount: string; payerAddress?: string | null; txHash?: string }) {
    const { store, chain, log } = this.deps;
    const found = store.trancheByIntent(intentId);
    if (!found) {
      log({ kind: 'topup-unknown-intent', intentId, via });
      return;
    }
    await withAccountLock(`tranche:${found.id}`, async () => {
      const t = store.getTranche(found.id)!;
      if (t.status !== 'REQUESTED') return;

      let paidStroops: bigint;
      try {
        paidStroops = toStroops(details.amount);
      } catch {
        paidStroops = -1n;
      }
      if (paidStroops !== t.amountStroops) {
        store.updateTranche(t.id, { status: 'FAILED', error: `Paid ${details.amount} XLM, expected ${fromStroops(t.amountStroops)} XLM` });
        log({ kind: 'topup-amount-mismatch', id: t.id, paid: details.amount });
        return;
      }

      store.updateTranche(t.id, { status: 'PAID', confirmedVia: via, payerAddress: details.payerAddress ?? null, veloPaymentTxHash: details.txHash });
      store.addEvent({ id: `velo-${intentId}`, type: 'payment.succeeded', ledger: 0, at: new Date().toISOString(), txHash: details.txHash ?? '', vehicleId: t.vehicleId, amountStroops: t.amountStroops, source: 'velo' });
      log({ kind: 'topup-paid', id: t.id, via });

      const vehicle = this.deps.vehicles.find((v) => v.id === t.vehicleId)!;
      try {
        const { hash } = await chain.fundEscrow({ ownerSecret: this.deps.ownerSecret, deviceHash: vehicle.deviceHash, amount: t.amountStroops });
        store.updateTranche(t.id, { status: 'FUNDED', fundTxHash: hash });
        log({ kind: 'topup-funded', id: t.id, tx: hash });
      } catch (err) {
        store.updateTranche(t.id, { status: 'FAILED', error: `fundEscrow failed: ${err instanceof Error ? err.message : String(err)}` });
        return;
      }
    });

    // Outside the tranche lock: retry fills that were waiting for this money.
    const t = store.getTranche(found.id);
    if (t?.status === 'FUNDED' && this.agent) await this.agent.processAwaitingFunds(t.vehicleId);
  }
}
