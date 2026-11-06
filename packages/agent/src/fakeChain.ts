// In-memory stand-in for the Noir contracts. Used by unit tests and by `npm run dev:fake`
// (offline UI work). Never used when CHAIN_MODE is unset: production always runs NoirChain.
import { randomBytes } from 'node:crypto';
import { NoirContractError, refusalReason } from '@noirx402/agent-sdk';
import { Keypair } from '@stellar/stellar-sdk';
import type { ChainEvent, ChainPolicy, ChainPort, PaymentCheck } from './chainPort';

const FAKE_ASSET = 'CFAKEXLMTOKEN';

export class FakeChain implements ChainPort {
  readonly mode = 'fake' as const;
  readonly asset = FAKE_ASSET;
  ledger = 1000;
  devices = new Map<string, { owner: string; agent: string }>();
  policies = new Map<string, ChainPolicy>();
  escrow = new Map<string, bigint>();
  pending = new Map<string, bigint>();
  private watchers = new Set<(e: ChainEvent) => void | Promise<void>>();
  /** Set to make the next write fail with this contract error name. */
  failNext: string | null = null;
  /** Milliseconds each write "takes", to mimic ledger close times in the UI. */
  constructor(public latencyMs = 0) {}

  publicKeyOf(secret: string): string {
    return Keypair.fromSecret(secret).publicKey();
  }

  private async tx(type: string, fields: Omit<ChainEvent, 'id' | 'type' | 'ledger' | 'ledgerClosedAt' | 'txHash'>) {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    if (this.failNext) {
      const name = this.failNext;
      this.failNext = null;
      throw new NoirContractError('paymentEscrow', 99, name, type);
    }
    const hash = randomBytes(32).toString('hex');
    this.ledger += 1;
    const event: ChainEvent = { id: `${this.ledger}-${hash.slice(0, 8)}`, type, ledger: this.ledger, ledgerClosedAt: new Date().toISOString(), txHash: hash, ...fields };
    for (const w of this.watchers) setTimeout(() => void w(event), 10);
    return hash;
  }

  async getPolicy(deviceHash: string) {
    return this.policies.get(deviceHash) ?? null;
  }
  async getDeviceOwner(deviceHash: string) {
    return this.devices.get(deviceHash)?.owner ?? null;
  }
  async getEscrowBalance(deviceHash: string) {
    return this.escrow.get(deviceHash) ?? 0n;
  }
  async getPendingBalance(merchant: string) {
    return this.pending.get(merchant) ?? 0n;
  }

  async checkPayment(p: { deviceHash: string; agent: string; amount: bigint }): Promise<PaymentCheck> {
    // Mirrors NoirAgentClient.checkPayment: policy predicate first, then the escrow balance.
    if (p.amount <= 0n) return { ok: false, reason: 'invalid_amount' };
    const policy = this.policies.get(p.deviceHash) ?? null;
    const now = new Date();
    const allowed =
      !!policy &&
      policy.agent === p.agent &&
      policy.asset === this.asset &&
      (policy.maxAmount === 0n || p.amount <= policy.maxAmount) &&
      (!policy.expiresAt || now <= policy.expiresAt);
    if (!allowed) return { ok: false, reason: refusalReason(policy, { agent: p.agent, asset: this.asset, amount: p.amount }, now) };
    if ((this.escrow.get(p.deviceHash) ?? 0n) < p.amount) return { ok: false, reason: 'insufficient_escrow' };
    return { ok: true };
  }

  async registerDevice(p: { ownerSecret: string; deviceHash: string; agent: string }) {
    const owner = this.publicKeyOf(p.ownerSecret);
    this.devices.set(p.deviceHash, { owner, agent: p.agent });
    return { hash: await this.tx('device.registered', { deviceHash: p.deviceHash, agent: p.agent }) };
  }

  async registerAgent(p: { ownerSecret: string; deviceHash: string; agent: string; maxAmount: bigint; expiresAt: Date }) {
    this.policies.set(p.deviceHash, { agent: p.agent, maxAmount: p.maxAmount, asset: this.asset, expiresAt: p.expiresAt });
    return { hash: await this.tx('agent.registered', { deviceHash: p.deviceHash, agent: p.agent }) };
  }

  async fundEscrow(p: { ownerSecret: string; deviceHash: string; amount: bigint }) {
    const hash = await this.tx('escrow.funded', { deviceHash: p.deviceHash, amount: p.amount });
    this.escrow.set(p.deviceHash, (this.escrow.get(p.deviceHash) ?? 0n) + p.amount);
    return { hash };
  }

  async defundEscrow(p: { ownerSecret: string; deviceHash: string; amount: bigint }) {
    const bal = this.escrow.get(p.deviceHash) ?? 0n;
    if (bal < p.amount) throw new NoirContractError('paymentEscrow', 1, 'InsufficientBalance', 'defund_escrow');
    const hash = await this.tx('escrow.defunded', { deviceHash: p.deviceHash, amount: p.amount });
    this.escrow.set(p.deviceHash, bal - p.amount);
    return { hash };
  }

  async authorizePayment(p: { agentSecret: string; deviceHash: string; merchant: string; amount: bigint }) {
    const agent = this.publicKeyOf(p.agentSecret);
    const check = await this.checkPayment({ deviceHash: p.deviceHash, agent, amount: p.amount });
    if (!check.ok) throw new NoirContractError('paymentEscrow', 2, check.reason === 'insufficient_escrow' ? 'InsufficientBalance' : 'AgentNotAuthorized', 'authorize');
    const hash = await this.tx('payment.authorized', { deviceHash: p.deviceHash, merchant: p.merchant, amount: p.amount });
    this.escrow.set(p.deviceHash, (this.escrow.get(p.deviceHash) ?? 0n) - p.amount);
    this.pending.set(p.merchant, (this.pending.get(p.merchant) ?? 0n) + p.amount);
    return { hash, nonce: BigInt(Date.now()) };
  }

  async claim(p: { merchantSecret: string }) {
    const merchant = this.publicKeyOf(p.merchantSecret);
    const amount = this.pending.get(merchant) ?? 0n;
    if (amount === 0n) throw new NoirContractError('paymentEscrow', 3, 'NothingToClaim', 'claim');
    const hash = await this.tx('payment.claimed', { merchant, amount });
    this.pending.set(merchant, 0n);
    return { hash };
  }

  async unlinkDevice(p: { ownerSecret: string; deviceHash: string }) {
    const amount = this.escrow.get(p.deviceHash) ?? 0n;
    const h1 = await this.tx('agent.revoked', { deviceHash: p.deviceHash });
    const h2 = await this.tx('escrow.swept', { deviceHash: p.deviceHash, amount });
    const h3 = await this.tx('device.revoked', { deviceHash: p.deviceHash });
    this.escrow.set(p.deviceHash, 0n);
    this.policies.delete(p.deviceHash);
    this.devices.delete(p.deviceHash);
    return { hashes: [h1, h2, h3], escrowReturned: amount };
  }

  watch(onEvent: (e: ChainEvent) => void | Promise<void>): () => void {
    this.watchers.add(onEvent);
    return () => this.watchers.delete(onEvent);
  }
}
