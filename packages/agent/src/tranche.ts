// Sizes the vehicle agent's top-up request from its own usage. Pure (see docs/02 §9.3).
import { moneyLabel, perFillCapStroops, phpLabel, STROOPS_PER_XLM } from '@pasada/shared';
import type { ApprovedFill, ProgramConfig, TopUpPlan, VehicleConfig } from '@pasada/shared';

export interface PlanTopUpInput {
  vehicle: VehicleConfig;
  history: ApprovedFill[];
  balanceStroops: bigint;
  heldStroops: bigint;
  now: Date;
  program: ProgramConfig;
}

const DAY_MS = 86_400_000;

export function roundUpToWholeXlm(stroops: bigint): bigint {
  if (stroops <= 0n) return 0n;
  return ((stroops + STROOPS_PER_XLM - 1n) / STROOPS_PER_XLM) * STROOPS_PER_XLM;
}

export function planTopUp(input: PlanTopUpInput): TopUpPlan & { rationale: string } {
  const { vehicle, history, balanceStroops, heldStroops, now, program } = input;
  const weekFills = history.filter((f) => {
    const t = Date.parse(f.at);
    return t >= now.getTime() - 7 * DAY_MS && t <= now.getTime();
  });

  let dailyLiters: number;
  if (weekFills.length === 0) {
    dailyLiters = vehicle.tankLiters;
  } else {
    const oldest = Math.min(...weekFills.map((f) => Date.parse(f.at)));
    const days = Math.max(1, Math.ceil((now.getTime() - oldest) / DAY_MS));
    dailyLiters = Math.ceil(weekFills.reduce((s, f) => s + f.liters, 0) / days);
  }

  const days = program.trancheDays;
  const requestLiters = Math.min(Math.max(dailyLiters * days, vehicle.tankLiters), program.weeklyCapLiters);
  const targetStroops = BigInt(requestLiters) * program.subsidyStroopsPerLiter;
  const needed = heldStroops + targetStroops - balanceStroops;
  const floor = perFillCapStroops(vehicle, program);
  const amountStroops = roundUpToWholeXlm(needed > floor ? needed : floor);

  const heldPart = heldStroops > 0n ? `, plus ${phpLabel(heldStroops)} for the held fill` : '';
  const rationale =
    `Balance is ${phpLabel(balanceStroops)}. ${vehicle.plate} uses about ${dailyLiters} L a day, ` +
    `so I'm asking for ${requestLiters} L (${phpLabel(targetStroops)}) to cover the next ${days} days${heldPart}: ` +
    `${moneyLabel(amountStroops)}.`;

  return { dailyLiters, days, requestLiters, targetStroops, balanceStroops, heldStroops, amountStroops, rationale };
}
