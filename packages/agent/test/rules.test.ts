import { describe, expect, it } from 'vitest';
import { PROGRAM, findStation, findVehicle } from '@pasada/shared';
import type { ApprovedFill } from '@pasada/shared';
import { evaluateFill } from '../src/rules';

const now = new Date('2026-11-07T02:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

function run(vehicleId: string, stationId: string, liters: number, history: ApprovedFill[] = [], opts: { now?: Date; skip?: boolean } = {}) {
  return evaluateFill({
    vehicle: findVehicle(vehicleId),
    station: findStation(stationId),
    requestedLiters: liters,
    now: opts.now ?? now,
    history,
    program: PROGRAM,
    skipRefillWindow: opts.skip,
  });
}

describe('evaluateFill', () => {
  it('1. pays a normal fill in full', () => {
    const r = run('J1', 'S1', 40);
    expect(r.kind).toBe('pay');
    if (r.kind !== 'pay') return;
    expect(r.approvedLiters).toBe(40);
    expect(r.amountStroops).toBe(40_000_000n);
    expect(r.capped).toBe(false);
    expect(r.capReasons).toEqual([]);
  });

  it('2. caps an overfill at the tank size', () => {
    const r = run('J2', 'S2', 80);
    expect(r.kind).toBe('pay');
    if (r.kind !== 'pay') return;
    expect(r.approvedLiters).toBe(50);
    expect(r.amountStroops).toBe(50_000_000n);
    expect(r.capped).toBe(true);
    expect(r.capReasons).toEqual(['OVER_TANK_CAPACITY']);
  });

  it('3. refuses an unaccredited station', () => {
    const r = run('J1', 'S3', 20);
    expect(r).toMatchObject({ kind: 'refuse', reason: 'UNACCREDITED_STATION' });
  });

  it.each([0, 2.5, 201, -5])('4. refuses invalid liters (%s)', (liters) => {
    expect(run('J1', 'S1', liters)).toMatchObject({ kind: 'refuse', reason: 'INVALID_LITERS' });
  });

  it('5. refuses an unknown vehicle', () => {
    expect(run('J9', 'S1', 20)).toMatchObject({ kind: 'refuse', reason: 'UNKNOWN_VEHICLE' });
  });

  it('6. refuses after the program ends', () => {
    const r = run('J1', 'S1', 20, [], { now: new Date('2027-01-01T00:00:00Z') });
    expect(r).toMatchObject({ kind: 'refuse', reason: 'PROGRAM_EXPIRED' });
  });

  it('7. refuses when the weekly allowance is used up', () => {
    const history = [
      { at: daysAgo(1), liters: 60 },
      { at: daysAgo(2), liters: 60 },
      { at: daysAgo(3), liters: 30 },
    ];
    expect(run('J1', 'S1', 20, history)).toMatchObject({ kind: 'refuse', reason: 'WEEKLY_CAP_REACHED' });
  });

  it('8. pays only what is left of the weekly allowance', () => {
    const history = [
      { at: daysAgo(1), liters: 60 },
      { at: daysAgo(2), liters: 60 },
      { at: daysAgo(3), liters: 10 },
    ];
    const r = run('J1', 'S1', 40, history);
    expect(r.kind).toBe('pay');
    if (r.kind !== 'pay') return;
    expect(r.approvedLiters).toBe(20);
    expect(r.capReasons).toEqual(['WEEKLY_CAP_PARTIAL']);
  });

  it('9. holds a second fill that would overfill the tank within the hour', () => {
    const r = run('J1', 'S1', 30, [{ at: minutesAgo(12), liters: 40 }]);
    expect(r.kind).toBe('hold');
    if (r.kind !== 'hold') return;
    expect(r.reason).toBe('TOO_SOON');
    expect(r.approvedLiters).toBe(30);
    expect(r.amountStroops).toBe(30_000_000n);
  });

  it('10. allows a small top-up that still fits the tank', () => {
    const r = run('J1', 'S1', 10, [{ at: minutesAgo(12), liters: 40 }]);
    expect(r).toMatchObject({ kind: 'pay', approvedLiters: 10 });
  });

  it('11. allows a full fill after the refill window', () => {
    const r = run('J1', 'S1', 30, [{ at: minutesAgo(61), liters: 40 }]);
    expect(r).toMatchObject({ kind: 'pay', approvedLiters: 30 });
  });

  it('12. pays a held fill when the program releases it', () => {
    const r = run('J1', 'S1', 30, [{ at: minutesAgo(12), liters: 40 }], { skip: true });
    expect(r).toMatchObject({ kind: 'pay', approvedLiters: 30 });
  });

  it('13. ignores fills older than seven days', () => {
    const r = run('J1', 'S1', 40, [{ at: daysAgo(8), liters: 150 }]);
    expect(r).toMatchObject({ kind: 'pay', approvedLiters: 40 });
  });

  it('records a check for every rule that ran', () => {
    const r = run('J1', 'S1', 40);
    expect(r.checks.map((c) => c.rule)).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });
});
