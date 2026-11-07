// Shapes of the JSON the server sends to the web. Bigints are sent as decimal strings.
import type {
  HeldStatus,
  Outcome,
  ReasonCode,
  RuleCheck,
  StationId,
  TrancheStatus,
  VehicleId,
} from './types';

export interface ApiMoney {
  stroops: string;
  xlm: string;
  php: string;
}

export interface ApiDecision {
  id: string;
  createdAt: string;
  vehicleId: VehicleId;
  stationId: StationId;
  requestedLiters: number;
  outcome: Outcome;
  approvedLiters: number;
  amount: ApiMoney;
  reasons: ReasonCode[];
  checks: RuleCheck[];
  explanation: string;
  authorizeTxHash?: string;
  claimTxHash?: string;
  heldFillId?: string;
  trancheId?: string;
  errorName?: string;
  releasedFromHeldFillId?: string;
  sample?: boolean;
}

export interface ApiHeldFill {
  id: string;
  createdAt: string;
  vehicleId: VehicleId;
  stationId: StationId;
  requestedLiters: number;
  amount: ApiMoney;
  reason: 'TOO_SOON' | 'AWAITING_FUNDS';
  status: HeldStatus;
  decisionId: string;
  resolvedDecisionId?: string;
}

export interface ApiTranche {
  id: string;
  createdAt: string;
  updatedAt: string;
  vehicleId: VehicleId;
  status: TrancheStatus;
  amount: ApiMoney;
  rationale: string;
  requestLiters: number;
  checkoutUrl: string;
  receiverAddress?: string | null;
  payerAddress?: string | null;
  confirmedVia?: 'webhook' | 'poll';
  fundTxHash?: string;
  veloPaymentTxHash?: string;
  error?: string;
}

export interface ApiEvent {
  id: string;
  type: string;
  ledger: number;
  at: string;
  txHash: string;
  vehicleId?: VehicleId;
  stationId?: StationId;
  amount?: ApiMoney;
  source: 'noir' | 'velo';
}

export interface ApiVehicleState {
  id: VehicleId;
  plate: string;
  route: string;
  tankLiters: number;
  escrow: ApiMoney | null;
  lowBalanceThreshold: ApiMoney;
  isLow: boolean;
  weeklyUsedLiters: number;
  weeklyCapLiters: number;
  lastFillAt: string | null;
  policy: { maxAmount: ApiMoney; expiresAt: string | null; agent: string } | null;
  openTrancheId: string | null;
}

export interface ApiStationState {
  id: StationId;
  name: string;
  accredited: boolean;
  publicKey: string;
  pending: ApiMoney | null;
  claimedToday: ApiMoney;
}

export interface ApiState {
  now: string;
  mode: 'testnet' | 'fake';
  vehicles: ApiVehicleState[];
  stations: ApiStationState[];
  decisions: ApiDecision[];
  held: ApiHeldFill[];
  tranches: ApiTranche[];
  events: ApiEvent[];
}

export interface ApiConfig {
  mode: 'testnet' | 'fake';
  demo?: boolean;
  program: {
    name: string;
    subsidyPerLiter: ApiMoney;
    phpPerXlmDemoRate: number;
    weeklyCapLiters: number;
    refillWindowMinutes: number;
    programEndsAt: string;
  };
  vehicles: Array<{
    id: VehicleId;
    plate: string;
    route: string;
    tankLiters: number;
    deviceHash: string;
    agentPublicKey: string;
    perFillCap: ApiMoney;
  }>;
  stations: Array<{ id: StationId; name: string; accredited: boolean; publicKey: string }>;
  programOwnerPublicKey: string;
  contracts: { deviceRegistry: string; agentRegistry: string; paymentEscrow: string };
  explorerBase: string;
  repoUrl: string;
}
