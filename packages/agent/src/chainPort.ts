// Everything the agents need from the chain. Implemented by noirChain.ts (real Noir SDK on Testnet)
// and fakeChain.ts (in-memory, for unit tests and offline UI work only).

export type PaymentRefusal =
  | 'no_agent'
  | 'wrong_agent'
  | 'wrong_asset'
  | 'invalid_amount'
  | 'over_limit'
  | 'expired'
  | 'insufficient_escrow';

export type PaymentCheck = { ok: true } | { ok: false; reason: PaymentRefusal };

export interface ChainPolicy {
  agent: string;
  maxAmount: bigint;
  asset: string;
  expiresAt: Date | null;
}

export interface ChainEvent {
  id: string;
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  deviceHash?: string;
  merchant?: string;
  agent?: string;
  amount?: bigint;
}

export interface ChainPort {
  readonly mode: 'testnet' | 'fake';
  /** Token contract of native XLM on Testnet. */
  readonly asset: string;
  publicKeyOf(secret: string): string;

  // reads
  getPolicy(deviceHash: string): Promise<ChainPolicy | null>;
  getDeviceOwner(deviceHash: string): Promise<string | null>;
  getEscrowBalance(deviceHash: string): Promise<bigint>;
  getPendingBalance(merchant: string): Promise<bigint>;
  checkPayment(p: { deviceHash: string; agent: string; amount: bigint }): Promise<PaymentCheck>;

  // writes (each signed by the secret passed in; the server holds every key)
  registerDevice(p: { ownerSecret: string; deviceHash: string; agent: string }): Promise<{ hash: string }>;
  registerAgent(p: { ownerSecret: string; deviceHash: string; agent: string; maxAmount: bigint; expiresAt: Date }): Promise<{ hash: string }>;
  fundEscrow(p: { ownerSecret: string; deviceHash: string; amount: bigint }): Promise<{ hash: string }>;
  defundEscrow(p: { ownerSecret: string; deviceHash: string; amount: bigint }): Promise<{ hash: string }>;
  authorizePayment(p: { agentSecret: string; deviceHash: string; merchant: string; amount: bigint }): Promise<{ hash: string; nonce: bigint }>;
  claim(p: { merchantSecret: string }): Promise<{ hash: string }>;
  unlinkDevice(p: { ownerSecret: string; deviceHash: string }): Promise<{ hashes: string[]; escrowReturned: bigint }>;

  // events
  watch(onEvent: (e: ChainEvent) => void | Promise<void>, onError?: (err: unknown) => void): () => void;
}
