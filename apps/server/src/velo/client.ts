// Velo: checkout sessions and payment status, through @carts1024/velo-sdk (server-side only).
import { randomUUID } from 'node:crypto';
import { Velo } from '@carts1024/velo-sdk';
import { env } from '../env';

export type IntentStatus = 'awaiting_route' | 'created' | 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';

export interface CheckoutParams {
  amount: string; // decimal XLM, e.g. "13"
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  id: string;
  paymentIntentId: string;
  checkoutUrl: string;
  receiverAddress: string | null;
  status: IntentStatus;
}

export interface IntentInfo {
  status: IntentStatus;
  amount: string;
  payerAddress: string | null;
}

export interface VeloPort {
  readonly mode: 'velo' | 'fake';
  readonly configured: boolean;
  createCheckout(params: CheckoutParams, idempotencyKey: string): Promise<CheckoutResult>;
  retrieve(intentId: string): Promise<IntentInfo>;
}

/** The real Velo API. */
export class RealVelo implements VeloPort {
  readonly mode = 'velo' as const;
  readonly configured: boolean;
  private client: Velo | null;

  constructor() {
    this.configured = !!env.VELO_API_KEY;
    this.client = this.configured
      ? new Velo({ apiKey: env.VELO_API_KEY, environment: 'testnet', timeoutMs: 15_000, maxRetries: 2, ...(env.VELO_BASE_URL ? { baseUrl: env.VELO_BASE_URL } : {}) })
      : null;
  }

  async createCheckout(params: CheckoutParams, idempotencyKey: string): Promise<CheckoutResult> {
    if (!this.client) throw new Error('VELO_API_KEY is not set on the server');
    const intent = await this.client.checkout.sessions.create(
      { amount: params.amount, asset: 'native', description: params.description, successUrl: params.successUrl, cancelUrl: params.cancelUrl },
      { idempotencyKey },
    );
    if (!intent.checkoutUrl) throw new Error(`Velo returned no checkoutUrl (status ${intent.status})`);
    return {
      id: intent.id,
      paymentIntentId: intent.paymentIntentId ?? intent.id,
      checkoutUrl: intent.checkoutUrl,
      receiverAddress: intent.receiverAddress ?? null,
      status: intent.status,
    };
  }

  async retrieve(intentId: string): Promise<IntentInfo> {
    if (!this.client) throw new Error('VELO_API_KEY is not set on the server');
    const intent = await this.client.paymentIntents.retrieve(intentId);
    return { status: intent.status, amount: intent.amount, payerAddress: intent.payerAddress ?? null };
  }
}

/** Offline stand-in for `npm run dev:fake`: a local checkout page you "pay" with one click. */
export class FakeVelo implements VeloPort {
  readonly mode = 'fake' as const;
  readonly configured = true;
  intents = new Map<string, { amount: string; status: IntentStatus; successUrl: string; cancelUrl: string; description: string; payerAddress: string | null }>();

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const id = `pi_fake_${randomUUID().slice(0, 8)}`;
    this.intents.set(id, { amount: params.amount, status: 'created', successUrl: params.successUrl, cancelUrl: params.cancelUrl, description: params.description, payerAddress: null });
    return { id, paymentIntentId: id, checkoutUrl: `${env.PUBLIC_SERVER_URL}/dev/checkout/${id}`, receiverAddress: null, status: 'created' };
  }

  async retrieve(intentId: string): Promise<IntentInfo> {
    const i = this.intents.get(intentId);
    if (!i) throw new Error('unknown intent');
    return { status: i.status, amount: i.amount, payerAddress: i.payerAddress };
  }

  pay(intentId: string) {
    const i = this.intents.get(intentId);
    if (i && i.status === 'created') {
      i.status = 'paid';
      i.payerAddress = 'GFAKETREASURER';
    }
    return i;
  }
}
