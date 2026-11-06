// In-memory state shared by the agents and the API. The server persists snapshots of it to disk.
// Money balances always come from the chain; this holds the decision log, held fills, top-ups and events.
import type {
  ApprovedFill,
  ChainEventRecord,
  Decision,
  HeldFill,
  StationId,
  Tranche,
  VehicleId,
} from '@pasada/shared';

const MAX_DECISIONS = 200;
const MAX_EVENTS = 300;

export interface StoreSnapshot {
  decisions: Decision[];
  held: HeldFill[];
  tranches: Tranche[];
  events: ChainEventRecord[];
  deliveries: string[];
}

export class PasadaStore {
  decisions: Decision[] = []; // newest first
  held: HeldFill[] = [];
  tranches: Tranche[] = [];
  events: ChainEventRecord[] = []; // newest first
  deliveries: string[] = [];
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  // ---------- decisions ----------
  addDecision(d: Decision): Decision {
    this.decisions.unshift(d);
    if (this.decisions.length > MAX_DECISIONS) this.decisions.length = MAX_DECISIONS;
    this.changed();
    return d;
  }

  updateDecision(id: string, patch: Partial<Decision>): Decision | undefined {
    const d = this.decisions.find((x) => x.id === id);
    if (d) {
      Object.assign(d, patch);
      this.changed();
    }
    return d;
  }

  /** Approved fills of a vehicle, used by the rules (weekly allowance, refill window). */
  history(vehicleId: VehicleId): ApprovedFill[] {
    return this.decisions
      .filter((d) => d.vehicleId === vehicleId && (d.outcome === 'APPROVED' || d.outcome === 'APPROVED_CAPPED'))
      .map((d) => ({ at: d.createdAt, liters: d.approvedLiters }));
  }

  /** Sets the claim tx on every paid, unclaimed decision for this station. Returns how many changed. */
  markClaimed(stationId: StationId, txHash: string): number {
    let n = 0;
    for (const d of this.decisions) {
      if (d.stationId === stationId && d.authorizeTxHash && !d.claimTxHash) {
        d.claimTxHash = txHash;
        n++;
      }
    }
    if (n) this.changed();
    return n;
  }

  // ---------- held fills ----------
  addHeld(h: HeldFill): HeldFill {
    this.held.unshift(h);
    this.changed();
    return h;
  }

  getHeld(id: string): HeldFill | undefined {
    return this.held.find((h) => h.id === id);
  }

  updateHeld(id: string, patch: Partial<HeldFill>): HeldFill | undefined {
    const h = this.getHeld(id);
    if (h) {
      Object.assign(h, patch);
      this.changed();
    }
    return h;
  }

  /** Open held fills for a vehicle, oldest first. */
  openHeld(vehicleId: VehicleId, status: HeldFill['status']): HeldFill[] {
    return this.held
      .filter((h) => h.vehicleId === vehicleId && h.status === status)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  // ---------- tranches ----------
  addTranche(t: Tranche): Tranche {
    this.tranches.unshift(t);
    this.changed();
    return t;
  }

  getTranche(id: string): Tranche | undefined {
    return this.tranches.find((t) => t.id === id);
  }

  updateTranche(id: string, patch: Partial<Tranche>): Tranche | undefined {
    const t = this.getTranche(id);
    if (t) {
      Object.assign(t, patch, { updatedAt: new Date().toISOString() });
      this.changed();
    }
    return t;
  }

  openTranche(vehicleId: VehicleId): Tranche | undefined {
    return this.tranches.find((t) => t.vehicleId === vehicleId && (t.status === 'REQUESTED' || t.status === 'PAID'));
  }

  trancheByIntent(intentId: string): Tranche | undefined {
    return this.tranches.find((t) => t.paymentIntentId === intentId || t.veloObjectId === intentId);
  }

  // ---------- events ----------
  addEvent(e: ChainEventRecord): boolean {
    if (this.events.some((x) => x.id === e.id)) return false;
    this.events.unshift(e);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
    this.changed();
    return true;
  }

  // ---------- webhook deliveries ----------
  hasDelivery(id: string): boolean {
    return this.deliveries.includes(id);
  }

  addDelivery(id: string) {
    this.deliveries.push(id);
    if (this.deliveries.length > 500) this.deliveries.splice(0, this.deliveries.length - 500);
    this.changed();
  }

  // ---------- persistence ----------
  reset() {
    this.decisions = [];
    this.held = [];
    this.tranches = [];
    this.events = [];
    this.deliveries = [];
    this.changed();
  }

  snapshot(): StoreSnapshot {
    return { decisions: this.decisions, held: this.held, tranches: this.tranches, events: this.events, deliveries: this.deliveries };
  }

  load(s: Partial<StoreSnapshot>) {
    this.decisions = s.decisions ?? [];
    this.held = s.held ?? [];
    this.tranches = s.tranches ?? [];
    this.events = s.events ?? [];
    this.deliveries = s.deliveries ?? [];
  }
}

/** JSON with bigints as {"$bigint":"123"} so a snapshot round-trips exactly. */
export function stringifySnapshot(s: StoreSnapshot): string {
  return JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? { $bigint: v.toString() } : v));
}

export function parseSnapshot(text: string): StoreSnapshot {
  return JSON.parse(text, (_k, v) => (v && typeof v === 'object' && typeof v.$bigint === 'string' ? BigInt(v.$bigint) : v));
}
