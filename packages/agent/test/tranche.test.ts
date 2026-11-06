import { describe, expect, it } from 'vitest';
import { PROGRAM, findVehicle } from '@pasada/shared';
import { planTopUp, roundUpToWholeXlm } from '../src/tranche';

const now = new Date('2026-11-07T02:00:00Z');
const J3 = findVehicle('J3')!;

describe('planTopUp', () => {
  it('sizes the S5 top-up: no history, 3 XLM balance, 4 XLM held → 13 XLM', () => {
    const plan = planTopUp({ vehicle: J3, history: [], balanceStroops: 30_000_000n, heldStroops: 40_000_000n, now, program: PROGRAM });
    expect(plan.dailyLiters).toBe(60);
    expect(plan.requestLiters).toBe(120);
    expect(plan.targetStroops).toBe(120_000_000n);
    expect(plan.amountStroops).toBe(130_000_000n);
  });

  it('never asks for less than one full tank', () => {
    const plan = planTopUp({ vehicle: J3, history: [], balanceStroops: 115_000_000n, heldStroops: 0n, now, program: PROGRAM });
    expect(plan.amountStroops).toBe(60_000_000n);
  });

  it('uses recent usage to size the request', () => {
    const history = [
      { at: new Date(now.getTime() - 2 * 86_400_000).toISOString(), liters: 30 },
      { at: new Date(now.getTime() - 1 * 86_400_000).toISOString(), liters: 30 },
    ];
    const plan = planTopUp({ vehicle: J3, history, balanceStroops: 0n, heldStroops: 0n, now, program: PROGRAM });
    expect(plan.dailyLiters).toBe(30); // 60 L over 2 days
    expect(plan.requestLiters).toBe(60); // 30 × 2 days, but never below one tank (60)
    expect(plan.amountStroops).toBe(60_000_000n);
  });

  it('rounds up to whole XLM', () => {
    expect(roundUpToWholeXlm(123_000_000n)).toBe(130_000_000n);
    expect(roundUpToWholeXlm(130_000_000n)).toBe(130_000_000n);
  });
});
