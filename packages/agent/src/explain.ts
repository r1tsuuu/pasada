// Plain sentences for every decision (docs/02 §8.4). Peso first, XLM in brackets.
import { moneyLabel, phpLabel } from '@pasada/shared';
import type { Outcome, ReasonCode, StationConfig, VehicleConfig } from '@pasada/shared';

export interface ExplainInput {
  outcome: Outcome;
  reasons: ReasonCode[];
  vehicle?: VehicleConfig;
  station?: StationConfig;
  requestedLiters: number;
  approvedLiters: number;
  amountStroops: bigint;
  weeklyUsedAfter?: number;
  weeklyCap?: number;
  lastFillLiters?: number;
  minutesSinceLastFill?: number;
  balanceStroops?: bigint;
  topUpStroops?: bigint;
  errorName?: string;
  /** "Released by the program. " or "Funds arrived. " */
  prefix?: string;
}

function ago(minutes: number): string {
  if (minutes < 1) return 'less than a minute ago';
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
}

export function explain(i: ExplainInput): string {
  const plate = i.vehicle?.plate ?? 'This jeepney';
  const station = i.station?.name ?? 'This station';
  const money = moneyLabel(i.amountStroops);
  const prefix = i.prefix ?? '';
  const has = (r: ReasonCode) => i.reasons.includes(r);

  switch (i.outcome) {
    case 'APPROVED':
      return `${prefix}Approved ${i.approvedLiters} L at ${station}. Paid ${money} from ${plate}'s fuel aid. This week: ${i.weeklyUsedAfter ?? i.approvedLiters}/${i.weeklyCap ?? 150} L.`;
    case 'APPROVED_CAPPED':
      if (has('OVER_TANK_CAPACITY')) {
        return `${prefix}Asked for ${i.requestedLiters} L, but ${plate}'s tank holds ${i.vehicle?.tankLiters} L. Approved ${i.approvedLiters} L and paid ${money}.`;
      }
      return `${prefix}Only ${i.approvedLiters} L left of this week's ${i.weeklyCap ?? 150} L allowance. Approved ${i.approvedLiters} L and paid ${money}.`;
    case 'HELD':
      if (has('AWAITING_FUNDS')) {
        const top = i.topUpStroops !== undefined ? `asked the program for a ${moneyLabel(i.topUpStroops)} top-up` : 'is asking the program for a top-up';
        return `The fuel-aid balance is ${phpLabel(i.balanceStroops ?? 0n)} and this fill needs ${phpLabel(i.amountStroops)}. Held the fill and ${top}.`;
      }
      return `${plate} took ${i.lastFillLiters} L ${ago(i.minutesSinceLastFill ?? 0)}. Another ${i.requestedLiters} L would overfill its ${i.vehicle?.tankLiters} L tank within an hour, so this fill is held for program review.`;
    case 'REFUSED':
      if (has('UNACCREDITED_STATION')) return `${station} is not an accredited station. No payment made.`;
      if (has('WEEKLY_CAP_REACHED')) return `${plate} has used its ${i.weeklyCap ?? 150} L allowance for this week. No payment made.`;
      if (has('PROGRAM_EXPIRED')) return 'The fuel-aid program has ended. No payment made.';
      if (has('UNKNOWN_VEHICLE')) return 'This card is not enrolled in the program. No payment made.';
      if (has('INVALID_LITERS')) return `${i.requestedLiters} L is not a valid amount. Enter whole liters from 1 to 200.`;
      {
        const policy = i.reasons.find((r) => r.startsWith('POLICY_'));
        return `Noir's on-chain policy refused this payment (${(policy ?? 'POLICY').replace('POLICY_', '').toLowerCase()}). No payment made.`;
      }
    case 'FAILED':
      return `The payment did not go through (${i.errorName ?? 'unknown error'}). No money moved; try again.`;
  }
}
