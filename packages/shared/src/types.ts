export type VehicleId = 'J1' | 'J2' | 'J3';
export type StationId = 'S1' | 'S2' | 'S3';

export type Outcome = 'APPROVED' | 'APPROVED_CAPPED' | 'HELD' | 'REFUSED' | 'FAILED';

export type ReasonCode =
  | 'OK'
  | 'UNKNOWN_VEHICLE'
  | 'INVALID_LITERS'
  | 'UNACCREDITED_STATION'
  | 'PROGRAM_EXPIRED'
  | 'WEEKLY_CAP_REACHED'
  | 'WEEKLY_CAP_PARTIAL'
  | 'OVER_TANK_CAPACITY'
  | 'TOO_SOON'
  | 'AWAITING_FUNDS'
  | 'POLICY_NO_AGENT'
  | 'POLICY_WRONG_AGENT'
  | 'POLICY_WRONG_ASSET'
  | 'POLICY_INVALID_AMOUNT'
  | 'POLICY_OVER_LIMIT'
  | 'RELEASED_BY_PROGRAM'
  | 'CHAIN_ERROR';

export type RuleId = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'C1' | 'C2';

export interface RuleCheck {
  rule: RuleId;
  label: string;
  passed: boolean;
  detail: string;
}

export interface Decision {
  id: string;
  createdAt: string;
  vehicleId: VehicleId;
  stationId: StationId;
  requestedLiters: number;
  outcome: Outcome;
  approvedLiters: number;
  amountStroops: bigint;
  reasons: ReasonCode[];
  checks: RuleCheck[];
  explanation: string;
  authorizeTxHash?: string;
  nonce?: string;
  claimTxHash?: string;
  heldFillId?: string;
  trancheId?: string;
  errorName?: string;
  releasedFromHeldFillId?: string;
  /** DEMO_MODE seed row: not a real fill and never has a transaction. */
  sample?: boolean;
}

export type HeldStatus = 'NEEDS_REVIEW' | 'AWAITING_FUNDS' | 'RELEASED' | 'REJECTED';

export interface HeldFill {
  id: string;
  createdAt: string;
  vehicleId: VehicleId;
  stationId: StationId;
  requestedLiters: number;
  amountStroops: bigint;
  reason: 'TOO_SOON' | 'AWAITING_FUNDS';
  status: HeldStatus;
  decisionId: string;
  resolvedDecisionId?: string;
}

export type TrancheStatus = 'REQUESTED' | 'PAID' | 'FUNDED' | 'FAILED' | 'EXPIRED';

export interface TopUpPlan {
  dailyLiters: number;
  days: number;
  requestLiters: number;
  targetStroops: bigint;
  balanceStroops: bigint;
  heldStroops: bigint;
  amountStroops: bigint;
}

export interface Tranche {
  id: string;
  createdAt: string;
  updatedAt: string;
  vehicleId: VehicleId;
  status: TrancheStatus;
  amountStroops: bigint;
  rationale: string;
  plan: TopUpPlan;
  paymentIntentId: string;
  veloObjectId: string;
  checkoutUrl: string;
  receiverAddress?: string | null;
  payerAddress?: string | null;
  veloPaymentTxHash?: string;
  confirmedVia?: 'webhook' | 'poll';
  fundTxHash?: string;
  error?: string;
}

export interface ChainEventRecord {
  id: string;
  type: string;
  ledger: number;
  at: string;
  txHash: string;
  vehicleId?: VehicleId;
  stationId?: StationId;
  amountStroops?: bigint;
  source: 'noir' | 'velo';
}

export interface ApprovedFill {
  at: string;
  liters: number;
}

export interface VehicleConfig {
  id: VehicleId;
  plate: string;
  route: string;
  tankLiters: number;
  tagUid: string;
  initialEscrowStroops: bigint;
}

export interface StationConfig {
  id: StationId;
  name: string;
  accredited: boolean;
}

export interface ProgramConfig {
  name: string;
  subsidyStroopsPerLiter: bigint;
  phpPerXlmDemoRate: number;
  weeklyCapLiters: number;
  refillWindowMinutes: number;
  programEndsAt: Date;
  trancheDays: number;
  maxLitersPerRequest: number;
}
