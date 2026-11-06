// Every Noir call Pasada makes, through @noirx402/agent-sdk on the deployed Testnet contracts.
// The client is created WITHOUT a `network` override, so it uses the SDK's built-in TESTNET IDs:
// device_registry CAC4…QHU5, agent_registry CCMZ…EBV, payment_escrow CC7E…BFS.
import { NoirAgentClient, keypairSigner, type NoirEvent } from '@noirx402/agent-sdk';
import { Asset, Keypair, Networks } from '@stellar/stellar-sdk';
import type { ChainEvent, ChainPolicy, ChainPort, PaymentCheck } from './chainPort';
import { withAccountLock } from './lock';

export const NATIVE_XLM_TOKEN = Asset.native().contractId(Networks.TESTNET);

function toChainEvent(e: NoirEvent): ChainEvent {
  const base: ChainEvent = { id: e.id, type: e.type, ledger: e.ledger, ledgerClosedAt: e.ledgerClosedAt, txHash: e.txHash };
  if ('deviceHash' in e) base.deviceHash = e.deviceHash;
  if ('merchant' in e) base.merchant = e.merchant;
  if ('agent' in e) base.agent = e.agent;
  if ('amount' in e) base.amount = e.amount;
  return base;
}

export class NoirChain implements ChainPort {
  readonly mode = 'testnet' as const;
  readonly asset = NATIVE_XLM_TOKEN;
  readonly noir: NoirAgentClient;

  constructor(opts: { rpcUrl?: string } = {}) {
    // Never pass `network`: the hackathon requires the SDK's deployed TESTNET contracts.
    this.noir = new NoirAgentClient(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : undefined);
  }

  get contracts() {
    return this.noir.contracts;
  }

  publicKeyOf(secret: string): string {
    return Keypair.fromSecret(secret).publicKey();
  }

  // ---------- reads ----------
  getPolicy(deviceHash: string): Promise<ChainPolicy | null> {
    return this.noir.getPolicy(deviceHash);
  }

  getDeviceOwner(deviceHash: string): Promise<string | null> {
    return this.noir.getDeviceOwner(deviceHash);
  }

  getEscrowBalance(deviceHash: string): Promise<bigint> {
    return this.noir.getEscrowBalance(deviceHash);
  }

  getPendingBalance(merchant: string): Promise<bigint> {
    return this.noir.getPendingBalance(merchant);
  }

  checkPayment(p: { deviceHash: string; agent: string; amount: bigint }): Promise<PaymentCheck> {
    return this.noir.checkPayment({ deviceHash: p.deviceHash, agent: p.agent, asset: this.asset, amount: p.amount, requireEscrow: true });
  }

  // ---------- writes (owner) ----------
  registerDevice(p: { ownerSecret: string; deviceHash: string; agent: string }) {
    const owner = keypairSigner(p.ownerSecret);
    return withAccountLock(owner.publicKey, () =>
      this.noir.execute(owner, { kind: 'registerDevice', deviceHash: p.deviceHash, agent: p.agent }),
    );
  }

  registerAgent(p: { ownerSecret: string; deviceHash: string; agent: string; maxAmount: bigint; expiresAt: Date }) {
    const owner = keypairSigner(p.ownerSecret);
    return withAccountLock(owner.publicKey, () =>
      this.noir.execute(owner, {
        kind: 'registerAgent',
        deviceHash: p.deviceHash,
        agent: p.agent,
        asset: this.asset,
        maxAmount: p.maxAmount,
        expiresAt: p.expiresAt,
      }),
    );
  }

  fundEscrow(p: { ownerSecret: string; deviceHash: string; amount: bigint }) {
    const owner = keypairSigner(p.ownerSecret);
    return withAccountLock(owner.publicKey, () =>
      this.noir.execute(owner, { kind: 'fundEscrow', deviceHash: p.deviceHash, token: this.asset, amount: p.amount }),
    );
  }

  defundEscrow(p: { ownerSecret: string; deviceHash: string; amount: bigint }) {
    const owner = keypairSigner(p.ownerSecret);
    return withAccountLock(owner.publicKey, () =>
      this.noir.execute(owner, { kind: 'defundEscrow', deviceHash: p.deviceHash, token: this.asset, amount: p.amount }),
    );
  }

  unlinkDevice(p: { ownerSecret: string; deviceHash: string }) {
    const owner = keypairSigner(p.ownerSecret);
    return withAccountLock(owner.publicKey, () => this.noir.unlinkDevice({ owner, deviceHash: p.deviceHash }));
  }

  // ---------- writes (agent, merchant) ----------
  /** The vehicle agent pays a station from the jeepney's escrow, within its on-chain policy. */
  authorizePayment(p: { agentSecret: string; deviceHash: string; merchant: string; amount: bigint }) {
    const agent = keypairSigner(p.agentSecret);
    return withAccountLock(agent.publicKey, () =>
      this.noir.authorizePayment({ agent, deviceHash: p.deviceHash, merchant: p.merchant, asset: this.asset, amount: p.amount }),
    );
  }

  /** The station agent collects every pending payment. */
  claim(p: { merchantSecret: string }) {
    const merchant = keypairSigner(p.merchantSecret);
    return withAccountLock(merchant.publicKey, () => this.noir.claim({ merchant, token: this.asset }));
  }

  // ---------- events ----------
  watch(onEvent: (e: ChainEvent) => void | Promise<void>, onError?: (err: unknown) => void): () => void {
    return this.noir.watch({ onEvent: (e) => onEvent(toChainEvent(e)), onError });
  }
}
