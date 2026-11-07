// DEMO_MODE only: past fills so the dashboard isn't empty. Every row is flagged `sample` and has no
// transaction hash, so the site never presents it as on-chain proof. J3 stays empty on purpose: the
// agent sizes J3's top-up from its own history, and the demo script expects the 13 XLM request.
import { randomUUID } from 'node:crypto';
import type { PasadaStore } from '@pasada/agent';
import type { Decision } from '@pasada/shared';

const HOUR_MS = 3_600_000;

export function seedDemoData(store: PasadaStore, now = Date.now()) {
  const row = (hoursAgo: number, d: Pick<Decision, 'vehicleId' | 'stationId' | 'requestedLiters' | 'outcome' | 'approvedLiters' | 'amountStroops' | 'reasons' | 'explanation'>): Decision => ({
    id: randomUUID(),
    createdAt: new Date(now - hoursAgo * HOUR_MS).toISOString(),
    checks: [],
    sample: true,
    ...d,
  });

  store.reset();
  // addDecision puts the newest first, so add oldest to newest.
  store.addDecision(row(74, { vehicleId: 'J2', stationId: 'S3', requestedLiters: 25, outcome: 'REFUSED', approvedLiters: 0, amountStroops: 0n, reasons: ['UNACCREDITED_STATION'], explanation: 'Kanto Fuel Depot is not an accredited station. No payment made.' }));
  store.addDecision(row(50, { vehicleId: 'J1', stationId: 'S1', requestedLiters: 35, outcome: 'APPROVED', approvedLiters: 35, amountStroops: 35_000_000n, reasons: [], explanation: "Approved 35 L at Bituin Fuels — EDSA Cubao. Paid ₱420 (3.5 XLM) from NVE 1234's fuel aid. This week: 35/150 L." }));
  store.addDecision(row(26, { vehicleId: 'J2', stationId: 'S2', requestedLiters: 30, outcome: 'APPROVED', approvedLiters: 30, amountStroops: 30_000_000n, reasons: [], explanation: "Approved 30 L at Silangan Gas — Commonwealth. Paid ₱360 (3 XLM) from TXR 5678's fuel aid. This week: 30/150 L." }));
}
