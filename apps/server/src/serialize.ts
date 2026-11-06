// Turns internal records (bigint stroops) into the JSON shapes in @pasada/shared/api.ts.
import { phpLabel, xlmString } from '@pasada/shared';
import type { ApiDecision, ApiEvent, ApiHeldFill, ApiMoney, ApiTranche, ChainEventRecord, Decision, HeldFill, Tranche } from '@pasada/shared';

export function money(stroops: bigint): ApiMoney {
  return { stroops: stroops.toString(), xlm: xlmString(stroops), php: phpLabel(stroops) };
}

export function decisionJson(d: Decision): ApiDecision {
  const { amountStroops, nonce: _nonce, ...rest } = d;
  return { ...rest, amount: money(amountStroops) };
}

export function heldJson(h: HeldFill): ApiHeldFill {
  const { amountStroops, ...rest } = h;
  return { ...rest, amount: money(amountStroops) };
}

export function trancheJson(t: Tranche): ApiTranche {
  return {
    id: t.id,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    vehicleId: t.vehicleId,
    status: t.status,
    amount: money(t.amountStroops),
    rationale: t.rationale,
    requestLiters: t.plan.requestLiters,
    checkoutUrl: t.checkoutUrl,
    receiverAddress: t.receiverAddress,
    payerAddress: t.payerAddress,
    confirmedVia: t.confirmedVia,
    fundTxHash: t.fundTxHash,
    veloPaymentTxHash: t.veloPaymentTxHash,
    error: t.error,
  };
}

export function eventJson(e: ChainEventRecord): ApiEvent {
  const { amountStroops, ...rest } = e;
  return { ...rest, amount: amountStroops !== undefined ? money(amountStroops) : undefined };
}
