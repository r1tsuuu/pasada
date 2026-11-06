// The vehicle agent's rules. Pure: no I/O, `now` passed in. Order matters (see docs/02 §8.2).
import type { ApprovedFill, ProgramConfig, ReasonCode, RuleCheck, StationConfig, VehicleConfig } from '@pasada/shared';

export interface EvaluateInput {
  vehicle: VehicleConfig | undefined;
  station: StationConfig | undefined;
  requestedLiters: number;
  now: Date;
  history: ApprovedFill[];
  program: ProgramConfig;
  /** True when the program releases a held fill: skips rule R5. */
  skipRefillWindow?: boolean;
}

export type Evaluation =
  | { kind: 'refuse'; reason: ReasonCode; checks: RuleCheck[] }
  | { kind: 'hold'; reason: 'TOO_SOON'; approvedLiters: number; amountStroops: bigint; checks: RuleCheck[]; lastFill: ApprovedFill }
  | { kind: 'pay'; approvedLiters: number; amountStroops: bigint; capped: boolean; capReasons: ReasonCode[]; checks: RuleCheck[] };

const WEEK_MS = 7 * 86_400_000;

export function weeklyUsedLiters(history: ApprovedFill[], now: Date): number {
  const from = now.getTime() - WEEK_MS;
  return history
    .filter((f) => {
      const t = Date.parse(f.at);
      return t >= from && t <= now.getTime();
    })
    .reduce((sum, f) => sum + f.liters, 0);
}

export function lastFill(history: ApprovedFill[], now: Date): ApprovedFill | undefined {
  return history
    .filter((f) => Date.parse(f.at) <= now.getTime())
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
}

export function evaluateFill(input: EvaluateInput): Evaluation {
  const { vehicle, station, requestedLiters, now, history, program } = input;
  const checks: RuleCheck[] = [];
  const refuse = (reason: ReasonCode): Evaluation => ({ kind: 'refuse', reason, checks });

  // R0 — the vehicle is enrolled
  if (!vehicle) {
    checks.push({ rule: 'R0', label: 'Jeepney is enrolled', passed: false, detail: 'This card is not enrolled in the program' });
    return refuse('UNKNOWN_VEHICLE');
  }
  checks.push({ rule: 'R0', label: 'Jeepney is enrolled', passed: true, detail: `${vehicle.plate} (${vehicle.route})` });

  // R1 — liters are a whole number in range
  const validLiters = Number.isInteger(requestedLiters) && requestedLiters >= 1 && requestedLiters <= program.maxLitersPerRequest;
  checks.push({
    rule: 'R1',
    label: 'Liters are valid',
    passed: validLiters,
    detail: validLiters ? `${requestedLiters} L requested` : `${requestedLiters} L is not a whole number from 1 to ${program.maxLitersPerRequest}`,
  });
  if (!validLiters) return refuse('INVALID_LITERS');

  // R2 — the station is accredited
  const accredited = !!station && station.accredited;
  checks.push({
    rule: 'R2',
    label: 'Station is accredited',
    passed: accredited,
    detail: station ? (accredited ? `${station.name} is on the program list` : `${station.name} is not on the program list`) : 'Unknown station',
  });
  if (!accredited) return refuse('UNACCREDITED_STATION');

  // R3 — the program is still running
  const active = now.getTime() < program.programEndsAt.getTime();
  checks.push({
    rule: 'R3',
    label: 'Program is active',
    passed: active,
    detail: active ? `Runs until ${program.programEndsAt.toISOString().slice(0, 10)}` : 'The program has ended',
  });
  if (!active) return refuse('PROGRAM_EXPIRED');

  // R4 — weekly allowance left
  const used = weeklyUsedLiters(history, now);
  const remaining = program.weeklyCapLiters - used;
  checks.push({
    rule: 'R4',
    label: 'Weekly allowance left',
    passed: remaining > 0,
    detail: `${used} of ${program.weeklyCapLiters} L used in the last 7 days`,
  });
  if (remaining <= 0) return refuse('WEEKLY_CAP_REACHED');

  // R6 is computed before R5 so a held fill still knows its amount.
  const approvedLiters = Math.min(requestedLiters, vehicle.tankLiters, remaining);
  const capReasons: ReasonCode[] = [];
  if (vehicle.tankLiters < requestedLiters && vehicle.tankLiters === approvedLiters) capReasons.push('OVER_TANK_CAPACITY');
  if (remaining < requestedLiters && remaining === approvedLiters) capReasons.push('WEEKLY_CAP_PARTIAL');
  const capped = approvedLiters < requestedLiters;
  const amountStroops = BigInt(approvedLiters) * program.subsidyStroopsPerLiter;

  // R5 — refill window: a second fill within the hour must still fit the tank
  const last = lastFill(history, now);
  if (input.skipRefillWindow) {
    checks.push({ rule: 'R5', label: 'Refill makes sense', passed: true, detail: 'Released by the program' });
  } else {
    const minutesSince = last ? Math.floor((now.getTime() - Date.parse(last.at)) / 60_000) : null;
    const tooSoon = !!last && minutesSince !== null && minutesSince < program.refillWindowMinutes && last.liters + requestedLiters > vehicle.tankLiters;
    checks.push({
      rule: 'R5',
      label: 'Refill makes sense',
      passed: !tooSoon,
      detail: !last
        ? 'No recent fill'
        : tooSoon
          ? `${last.liters} L ${minutesSince} min ago + ${requestedLiters} L is more than the ${vehicle.tankLiters} L tank`
          : `Last fill ${last.liters} L, ${minutesSince} min ago`,
    });
    if (tooSoon && last) return { kind: 'hold', reason: 'TOO_SOON', approvedLiters, amountStroops, checks, lastFill: last };
  }

  // R6 — cap the liters
  checks.push({
    rule: 'R6',
    label: 'Liters within limits',
    passed: true,
    detail: capped
      ? `Approved ${approvedLiters} of ${requestedLiters} L (${capReasons.includes('OVER_TANK_CAPACITY') ? `tank holds ${vehicle.tankLiters} L` : `${remaining} L left this week`})`
      : `${approvedLiters} L fits the ${vehicle.tankLiters} L tank and the weekly allowance`,
  });

  return { kind: 'pay', approvedLiters, amountStroops, capped, capReasons, checks };
}
