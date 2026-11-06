// The station agent (a "merchant assistant"): watches Noir for payment.authorized events to our
// stations and claims the pending balance. A sweeper catches anything the watch missed.
import { NoirContractError } from '@noirx402/agent-sdk';
import type { ChainEventRecord, StationId } from '@pasada/shared';
import type { ChainEvent, ChainPort } from './chainPort';
import type { Logger, StationRuntime, VehicleRuntime } from './runtime';
import type { PasadaStore } from './store';

export interface StationAgentDeps {
  chain: ChainPort;
  store: PasadaStore;
  stations: StationRuntime[];
  vehicles: VehicleRuntime[];
  log?: Logger;
  debounceMs?: number;
  sweepMs?: number;
}

export class StationAgent {
  private timers = new Map<StationId, ReturnType<typeof setTimeout>>();
  private claiming = new Set<StationId>();

  constructor(private readonly deps: StationAgentDeps) {}

  /** Starts the event watch and the sweeper. Returns a stop function. */
  start(): () => void {
    const stopWatch = this.deps.chain.watch(
      (e) => this.onEvent(e),
      (err) => this.deps.log?.({ kind: 'watch-error', error: err instanceof Error ? err.message : String(err) }),
    );
    const sweeper = setInterval(() => {
      for (const s of this.deps.stations) if (s.accredited && s.secret) this.nudge(s.id);
    }, this.deps.sweepMs ?? 20_000);
    return () => {
      stopWatch();
      clearInterval(sweeper);
      for (const t of this.timers.values()) clearTimeout(t);
    };
  }

  /** Claim for this station soon (debounced). */
  nudge(stationId: StationId) {
    const existing = this.timers.get(stationId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      stationId,
      setTimeout(() => {
        this.timers.delete(stationId);
        void this.claimNow(stationId);
      }, this.deps.debounceMs ?? 3_000),
    );
  }

  /** Claims everything pending for the station. Returns the claim tx hash, or null if nothing was pending. */
  async claimNow(stationId: StationId): Promise<string | null> {
    const station = this.deps.stations.find((s) => s.id === stationId);
    if (!station?.secret || !station.accredited || this.claiming.has(stationId)) return null;
    this.claiming.add(stationId);
    try {
      const pending = await this.deps.chain.getPendingBalance(station.publicKey);
      if (pending <= 0n) return null;
      const { hash } = await this.deps.chain.claim({ merchantSecret: station.secret });
      const n = this.deps.store.markClaimed(station.id, hash);
      this.deps.log?.({ kind: 'claim', station: station.id, amountStroops: pending, tx: hash, decisions: n });
      return hash;
    } catch (err) {
      if (!(err instanceof NoirContractError && err.errorName === 'NothingToClaim')) {
        this.deps.log?.({ kind: 'claim-failed', station: stationId, error: err instanceof Error ? err.message : String(err) });
      }
      return null;
    } finally {
      this.claiming.delete(stationId);
    }
  }

  private onEvent(e: ChainEvent) {
    const vehicle = e.deviceHash ? this.deps.vehicles.find((v) => v.deviceHash === e.deviceHash) : undefined;
    const station = e.merchant ? this.deps.stations.find((s) => s.publicKey === e.merchant) : undefined;
    if (!vehicle && !station) return; // someone else's Noir activity

    const record: ChainEventRecord = {
      id: e.id,
      type: e.type,
      ledger: e.ledger,
      at: e.ledgerClosedAt,
      txHash: e.txHash,
      vehicleId: vehicle?.id,
      stationId: station?.id,
      amountStroops: e.amount,
      source: 'noir',
    };
    this.deps.store.addEvent(record);

    if (e.type === 'payment.authorized' && station?.accredited && station.secret) this.nudge(station.id);
    if (e.type === 'payment.claimed' && station) this.deps.store.markClaimed(station.id, e.txHash);
  }
}
