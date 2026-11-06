// The vehicle agent: holds each jeepney's constrained Noir agent key and decides, pays and requests money.
//   DECIDES  — rules.ts (accredited station, weekly allowance, tank size, refill window)
//   MAKES    — Noir checkPayment → authorizePayment to the station
//   REQUESTS — when the escrow is short or low, asks the program for a top-up (ensureTopUp → Velo)
import { randomUUID } from 'node:crypto';
import { NoirContractError } from '@noirx402/agent-sdk';
import { lowBalanceThresholdStroops } from '@pasada/shared';
import type { Decision, HeldFill, ProgramConfig, ReasonCode, RuleCheck, StationId, Tranche, VehicleId } from '@pasada/shared';
import type { ChainPort } from './chainPort';
import { explain } from './explain';
import { evaluateFill, weeklyUsedLiters } from './rules';
import type { Logger, StationRuntime, VehicleRuntime } from './runtime';
import type { PasadaStore } from './store';

export interface VehicleAgentDeps {
  chain: ChainPort;
  store: PasadaStore;
  program: ProgramConfig;
  vehicles: VehicleRuntime[];
  stations: StationRuntime[];
  /** Creates (or returns the open) top-up request for a vehicle. Implemented by the server with Velo. */
  ensureTopUp: (vehicle: VehicleRuntime, now: Date) => Promise<Tranche | null>;
  /** Called after a successful payment so the station agent claims soon. */
  onPaid?: (stationId: StationId) => void;
  clock?: () => Date;
  log?: Logger;
}

export interface FillRequest {
  vehicleId: string;
  stationId: string;
  liters: number;
  skipRefillWindow?: boolean;
  releasedFromHeldFillId?: string;
  extraReasons?: ReasonCode[];
  prefix?: string;
}

const POLICY_REASON: Record<string, ReasonCode> = {
  no_agent: 'POLICY_NO_AGENT',
  wrong_agent: 'POLICY_WRONG_AGENT',
  wrong_asset: 'POLICY_WRONG_ASSET',
  invalid_amount: 'POLICY_INVALID_AMOUNT',
  over_limit: 'POLICY_OVER_LIMIT',
};

export class VehicleAgent {
  constructor(private readonly deps: VehicleAgentDeps) {}

  private now() {
    return this.deps.clock ? this.deps.clock() : new Date();
  }

  private log(entry: Record<string, unknown>) {
    this.deps.log?.(entry);
  }

  vehicle(id: string) {
    return this.deps.vehicles.find((v) => v.id === id);
  }

  station(id: string) {
    return this.deps.stations.find((s) => s.id === id);
  }

  /** A driver tapped the jeepney's card at a pump. Never throws. */
  async handleFill(req: FillRequest): Promise<Decision> {
    const { chain, store, program } = this.deps;
    const now = this.now();
    const vehicle = this.vehicle(req.vehicleId);
    const station = this.station(req.stationId);
    const history = vehicle ? store.history(vehicle.id) : [];
    const evaluation = evaluateFill({
      vehicle,
      station,
      requestedLiters: req.liters,
      now,
      history,
      program,
      skipRefillWindow: req.skipRefillWindow,
    });

    const base = {
      id: randomUUID(),
      createdAt: now.toISOString(),
      vehicleId: req.vehicleId as VehicleId,
      stationId: req.stationId as StationId,
      requestedLiters: req.liters,
      releasedFromHeldFillId: req.releasedFromHeldFillId,
    };
    const checks: RuleCheck[] = [...evaluation.checks];
    const extra = req.extraReasons ?? [];
    const finish = (d: Decision) => {
      store.addDecision(d);
      this.log({ kind: 'decision', id: d.id, vehicle: d.vehicleId, station: d.stationId, outcome: d.outcome, reasons: d.reasons, liters: d.approvedLiters, amountStroops: d.amountStroops, tx: d.authorizeTxHash });
      return d;
    };

    // ---- the rules refused or held the fill: no chain call ----
    if (evaluation.kind === 'refuse') {
      return finish({
        ...base, outcome: 'REFUSED', approvedLiters: 0, amountStroops: 0n, reasons: [evaluation.reason], checks,
        explanation: explain({ outcome: 'REFUSED', reasons: [evaluation.reason], vehicle, station, requestedLiters: req.liters, approvedLiters: 0, amountStroops: 0n, weeklyCap: program.weeklyCapLiters }),
      });
    }

    if (evaluation.kind === 'hold') {
      const minutes = Math.floor((now.getTime() - Date.parse(evaluation.lastFill.at)) / 60_000);
      const decision: Decision = {
        ...base, outcome: 'HELD', approvedLiters: 0, amountStroops: 0n, reasons: ['TOO_SOON'], checks,
        explanation: explain({ outcome: 'HELD', reasons: ['TOO_SOON'], vehicle, station, requestedLiters: req.liters, approvedLiters: 0, amountStroops: evaluation.amountStroops, lastFillLiters: evaluation.lastFill.liters, minutesSinceLastFill: minutes }),
      };
      const held = this.addHeld(decision, evaluation.amountStroops, 'TOO_SOON', 'NEEDS_REVIEW');
      decision.heldFillId = held.id;
      return finish(decision);
    }

    // ---- the rules say pay: ask Noir first (C1) ----
    const v = vehicle!;
    const s = station!;
    const amount = evaluation.amountStroops;
    let check;
    try {
      check = await chain.checkPayment({ deviceHash: v.deviceHash, agent: v.agentPublicKey, amount });
    } catch (err) {
      return finish(this.failed(base, checks, err, vehicle, station, req.liters));
    }

    if (!check.ok) {
      checks.push({ rule: 'C1', label: 'Noir checkPayment', passed: false, detail: `Refused: ${check.reason}` });
      if (check.reason === 'insufficient_escrow') {
        return finish(await this.holdForFunds(base, checks, v, s, req.liters, amount, now));
      }
      const reason: ReasonCode = check.reason === 'expired' ? 'PROGRAM_EXPIRED' : POLICY_REASON[check.reason] ?? 'POLICY_INVALID_AMOUNT';
      return finish({
        ...base, outcome: 'REFUSED', approvedLiters: 0, amountStroops: 0n, reasons: [reason], checks,
        explanation: explain({ outcome: 'REFUSED', reasons: [reason], vehicle, station, requestedLiters: req.liters, approvedLiters: 0, amountStroops: 0n }),
      });
    }
    checks.push({ rule: 'C1', label: 'Noir checkPayment', passed: true, detail: "The contract's policy and the escrow balance allow it" });

    // ---- pay the station (C2) ----
    let paid: { hash: string; nonce: bigint };
    try {
      paid = await chain.authorizePayment({ agentSecret: v.agentSecret, deviceHash: v.deviceHash, merchant: s.publicKey, amount });
    } catch (err) {
      checks.push({ rule: 'C2', label: 'Noir authorizePayment', passed: false, detail: err instanceof NoirContractError ? err.errorName : 'Transaction failed' });
      return finish(this.failed(base, checks, err, vehicle, station, req.liters));
    }
    checks.push({ rule: 'C2', label: 'Noir authorizePayment', passed: true, detail: `Paid ${s.name} from the escrow` });

    const outcome = evaluation.capped ? 'APPROVED_CAPPED' : 'APPROVED';
    const reasons: ReasonCode[] = [...extra, ...(evaluation.capped ? evaluation.capReasons : ['OK' as ReasonCode])];
    const decision: Decision = {
      ...base, outcome, approvedLiters: evaluation.approvedLiters, amountStroops: amount, reasons, checks,
      authorizeTxHash: paid.hash, nonce: paid.nonce.toString(),
      explanation: explain({
        outcome, reasons, vehicle, station, requestedLiters: req.liters, approvedLiters: evaluation.approvedLiters, amountStroops: amount,
        weeklyUsedAfter: weeklyUsedLiters(history, now) + evaluation.approvedLiters, weeklyCap: program.weeklyCapLiters, prefix: req.prefix,
      }),
    };
    finish(decision);
    this.deps.onPaid?.(s.id);

    // ---- after paying: is the balance low? then request money proactively ----
    try {
      const balance = await chain.getEscrowBalance(v.deviceHash);
      if (balance < lowBalanceThresholdStroops(v, program)) {
        const tranche = await this.deps.ensureTopUp(v, now);
        if (tranche) store.updateDecision(decision.id, { trancheId: tranche.id });
      }
    } catch (err) {
      this.log({ kind: 'balance-check-failed', vehicle: v.id, error: String(err) });
    }
    return decision;
  }

  private addHeld(decision: Decision, amountStroops: bigint, reason: HeldFill['reason'], status: HeldFill['status']): HeldFill {
    return this.deps.store.addHeld({
      id: randomUUID(),
      createdAt: decision.createdAt,
      vehicleId: decision.vehicleId,
      stationId: decision.stationId,
      requestedLiters: decision.requestedLiters,
      amountStroops,
      reason,
      status,
      decisionId: decision.id,
    });
  }

  private async holdForFunds(
    base: Pick<Decision, 'id' | 'createdAt' | 'vehicleId' | 'stationId' | 'requestedLiters' | 'releasedFromHeldFillId'>,
    checks: RuleCheck[], v: VehicleRuntime, s: StationRuntime, liters: number, amount: bigint, now: Date,
  ): Promise<Decision> {
    let balance = 0n;
    try {
      balance = await this.deps.chain.getEscrowBalance(v.deviceHash);
    } catch {
      /* shown as ₱0 */
    }
    const decision: Decision = {
      ...base, outcome: 'HELD', approvedLiters: 0, amountStroops: 0n, reasons: ['AWAITING_FUNDS'], checks, explanation: '',
    };
    const held = this.addHeld(decision, amount, 'AWAITING_FUNDS', 'AWAITING_FUNDS');
    decision.heldFillId = held.id;
    const tranche = await this.deps.ensureTopUp(v, now).catch((err) => {
      this.log({ kind: 'topup-failed', vehicle: v.id, error: String(err) });
      return null;
    });
    if (tranche) decision.trancheId = tranche.id;
    decision.explanation = explain({
      outcome: 'HELD', reasons: ['AWAITING_FUNDS'], vehicle: v, station: s, requestedLiters: liters, approvedLiters: 0,
      amountStroops: amount, balanceStroops: balance, topUpStroops: tranche?.status === 'FAILED' ? undefined : tranche?.amountStroops,
    });
    return decision;
  }

  private failed(
    base: Pick<Decision, 'id' | 'createdAt' | 'vehicleId' | 'stationId' | 'requestedLiters' | 'releasedFromHeldFillId'>,
    checks: RuleCheck[], err: unknown, vehicle: VehicleRuntime | undefined, station: StationRuntime | undefined, liters: number,
  ): Decision {
    const errorName = err instanceof NoirContractError ? err.errorName : 'UNKNOWN';
    this.log({ kind: 'chain-error', errorName, message: err instanceof Error ? err.message : String(err) });
    return {
      ...base, outcome: 'FAILED', approvedLiters: 0, amountStroops: 0n, reasons: ['CHAIN_ERROR'], checks, errorName,
      explanation: explain({ outcome: 'FAILED', reasons: ['CHAIN_ERROR'], vehicle, station, requestedLiters: liters, approvedLiters: 0, amountStroops: 0n, errorName }),
    };
  }

  /** The program approves a fill held for review (TOO_SOON). */
  async releaseHeld(heldId: string): Promise<Decision | null> {
    const held = this.deps.store.getHeld(heldId);
    if (!held || held.status !== 'NEEDS_REVIEW') return null;
    const decision = await this.handleFill({
      vehicleId: held.vehicleId, stationId: held.stationId, liters: held.requestedLiters,
      skipRefillWindow: true, releasedFromHeldFillId: held.id, extraReasons: ['RELEASED_BY_PROGRAM'], prefix: 'Released by the program. ',
    });
    this.deps.store.updateHeld(held.id, { status: 'RELEASED', resolvedDecisionId: decision.id });
    return decision;
  }

  rejectHeld(heldId: string): HeldFill | null {
    const held = this.deps.store.getHeld(heldId);
    if (!held || held.status !== 'NEEDS_REVIEW') return null;
    return this.deps.store.updateHeld(held.id, { status: 'REJECTED' }) ?? null;
  }

  /** After a top-up lands in the escrow: retry this vehicle's fills that were waiting for funds, oldest first. */
  async processAwaitingFunds(vehicleId: VehicleId): Promise<Decision[]> {
    const out: Decision[] = [];
    for (const held of this.deps.store.openHeld(vehicleId, 'AWAITING_FUNDS')) {
      this.deps.store.updateHeld(held.id, { status: 'RELEASED' });
      const decision = await this.handleFill({
        vehicleId: held.vehicleId, stationId: held.stationId, liters: held.requestedLiters,
        releasedFromHeldFillId: held.id, prefix: 'Funds arrived. ',
      });
      this.deps.store.updateHeld(held.id, { resolvedDecisionId: decision.id });
      out.push(decision);
    }
    return out;
  }

  /** "Agent: check balance" — ask for a top-up only when the escrow is below one tank of subsidy. */
  async checkBalance(vehicleId: string): Promise<Tranche | null> {
    const v = this.vehicle(vehicleId);
    if (!v) return null;
    const balance = await this.deps.chain.getEscrowBalance(v.deviceHash);
    if (balance >= lowBalanceThresholdStroops(v, this.deps.program)) return null;
    return this.deps.ensureTopUp(v, this.now());
  }
}
