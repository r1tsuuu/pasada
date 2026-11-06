# 05 — SDK reference (verified)

Copied from the published type definitions on 2026-11-06:
`@noirx402/agent-sdk@0.3.0` (`dist/*.d.ts`) and `@carts1024/velo-sdk@0.1.0-alpha.4` (`dist/*.d.ts`).
If something here disagrees with `node_modules/<pkg>/dist/*.d.ts`, the `.d.ts` wins.

## Noir — `@noirx402/agent-sdk@0.3.0`

- ESM only. Node `^22.23.4 || ^24.22.1 || >=26.12.1`. Peer dependency `@stellar/stellar-sdk@^16.0.1`.
- `TESTNET` (built in, use it by default — never override `network`):
  - `rpcUrl`: `https://soroban-testnet.stellar.org`
  - `deviceRegistry`: `CAC4KOLHDLDYDWBOKXNKRN5KVHO56PLOIFXDLTBUWGVN6GVDEB7FQHU5`
  - `agentRegistry`: `CCMZDSPTLX7IIJWCYEUM5DJUHOSOYSTHGK777S2TXZWEMC5ZZGPJ3EBV`
  - `paymentEscrow`: `CC7EAW5FNJEDBS7THM5IT6XIOHO4AOYMLXT3KSZ3HWUIKEACTW7E5BFS`

### Exports

```ts
export { NoirAgentClient, refusalReason, cursorLedger, toCall } from './client.js';
export { TESTNET } from './networks.js';
export { keypairSigner } from './signer.js';               // keypairSigner(secret: string): NoirSigner
export { decodeEvent, eventToJSON, NOIR_EVENT_TYPES } from './events.js';
export { NoirContractError, parseContractError } from './errors.js';
export { normalizeDeviceHash, deviceHashScVal } from './hash.js';
export { startWebhookRelay, verifyWebhookSignature, signWebhookBody, SIGNATURE_HEADER, DEFAULT_TOLERANCE_SEC } from './webhook.js';
export { toHex, fromHex } from './bytes.js';
export { walletSigner, noirExtension, noirExtensionSigner } from './wallets.js';
export { toStroops, fromStroops } from './amounts.js';    // toStroops('1.5') → 15000000n; fromStroops(15000000n) → '1.5'
```

### Types

```ts
interface NoirAgentPolicy { agent: string; maxAmount: bigint; /* 0n = no cap */ asset: string; expiresAt: Date | null; }
type PaymentRefusal = 'no_agent' | 'wrong_agent' | 'wrong_asset' | 'invalid_amount' | 'over_limit' | 'expired' | 'insufficient_escrow';
type PaymentCheck = { ok: true } | { ok: false; reason: PaymentRefusal };
interface NoirAgentClientOptions { network?: 'testnet' | NoirNetworkConfig; rpcUrl?: string; }
interface NoirSigner { publicKey: string; signTransaction(xdr: string, opts: { networkPassphrase: string }): Promise<string | { signedTxXdr: string }>; }

type NoirOperation =
  | { kind: 'registerDevice'; deviceHash: string; agent: string }
  | { kind: 'revokeDevice'; deviceHash: string }
  | { kind: 'authorize'; deviceHash: string; merchant: string; asset: string; amount: bigint; nonce: bigint }
  | { kind: 'claim'; token: string }
  | { kind: 'registerAgent'; deviceHash: string; agent: string; asset: string; maxAmount: bigint; expiresAt?: Date | null }
  | { kind: 'revokeAgent'; deviceHash: string }
  | { kind: 'fundEscrow'; deviceHash: string; token: string; amount: bigint }
  | { kind: 'defundEscrow'; deviceHash: string; token: string; amount: bigint }
  | { kind: 'sweepOnRevoke'; deviceHash: string; token: string; agent: string };

interface WatchOptions {
  onEvent: (event: NoirEvent) => void | Promise<void>;
  onError?: (error: unknown) => void;
  types?: NoirEventType[];   // default: all
  deviceHash?: string;       // only this device (merchant-only claims are dropped)
  merchant?: string;         // only this merchant
  fromLedger?: number;       // default: latest (new events only)
  pollMs?: number;           // default 5000
}
```

### `NoirAgentClient`

```ts
new NoirAgentClient(opts?: NoirAgentClientOptions)
// reads (no signer)
getPolicy(deviceHash): Promise<NoirAgentPolicy | null>
getDeviceOwner(deviceHash): Promise<string | null>
getDeviceAgent(deviceHash): Promise<string | null>
listDevices(wallet): Promise<string[]>
getEscrowBalance(deviceHash): Promise<bigint>
getEscrowToken(deviceHash): Promise<string | null>
getPendingBalance(merchant): Promise<bigint>
checkPayment({ deviceHash, agent, asset, amount, requireEscrow? }): Promise<PaymentCheck>
// writes
authorizePayment({ agent: NoirSigner, deviceHash, merchant, asset, amount, nonce? }): Promise<{ hash: string; nonce: bigint }>
  // nonce must increase per (device, agent); default is BigInt(Date.now())
claim({ merchant: NoirSigner, token }): Promise<{ hash: string }>   // collects every pending payment in `token`
unlinkDevice({ owner: NoirSigner, deviceHash }): Promise<{ hashes: string[]; escrowReturned: bigint }>
execute(signer: NoirSigner, op: NoirOperation): Promise<{ hash: string }>  // simulate, sign, submit, wait
prepare(source: string, op: NoirOperation): Promise<string>                // unsigned XDR
submit(signedXdr: string, op?: NoirOperation): Promise<string>
// events
getEvents({ startLedger?, cursor?, limit? }): Promise<{ events: NoirEvent[]; cursor: string; latestLedger: number }>
pastEvents(fromLedger: number): Promise<NoirEvent[]>   // RPC keeps ~7 days
watch(opts: WatchOptions): () => void                  // returns stop()
readonly server: rpc.Server                            // e.g. server.getLatestLedger()
```

Card lifecycle, in order (owner signs): `registerDevice` → `registerAgent` → `fundEscrow`. An escrow is
bound to the token it was first funded with; any other token fails with `InvalidAsset`.
**Never `revokeDevice` while the escrow holds funds** — use `unlinkDevice`.

### Events (`NoirEvent`)

Every event has `id` (unique; dedupe on it), `contractId`, `ledger`, `ledgerClosedAt`, `txHash`, plus:

| `type` | Fields |
| --- | --- |
| `device.registered`, `agent.registered` | `deviceHash`, `agent` |
| `device.revoked`, `agent.revoked` | `deviceHash` |
| `escrow.funded`, `escrow.defunded`, `escrow.swept` | `deviceHash`, `amount: bigint` |
| `payment.authorized` | `deviceHash`, `merchant`, `amount: bigint` |
| `payment.claimed` | `merchant`, `amount: bigint` |

### Errors

Refusals throw `NoirContractError { contract, code, errorName, method }`. Known `errorName`s:
`AgentNotAuthorized`, `InsufficientBalance`, `DuplicateAuth`, `NothingToClaim`, `InvalidAsset`,
`DeviceNotRegistered`, `NotOwner`, `InvalidRecipient`, `InvalidAmount`.

### Device hash

`deviceHash` = lowercase hex SHA-256 of the **UTF-8 bytes of the UID string** (Noir's convention,
`docs/nfc-hardware.md` in the Noir repo). `printf '%s' '04A1B2C3D4E501' | sha256sum` must match.

### Native XLM token contract

```ts
import { Asset, Networks } from '@stellar/stellar-sdk';
const ASSET = Asset.native().contractId(Networks.TESTNET);
```

## Velo — `@carts1024/velo-sdk@0.1.0-alpha.4`

- ESM only, **server-side only**. `1.0.0` was published on 2026-11-05 with the same API for everything we
  use (it only drops the `pdax` anchor); the handbook says to use the `alpha` tag, so we pin `0.1.0-alpha.4`.
- API origin for testnet: `https://www.velo-build.dev` (default).

```ts
import { Velo, VeloWebhookSignatureVerificationError, type PaymentIntent, type WebhookEvent } from '@carts1024/velo-sdk';

const velo = new Velo({ apiKey, environment: 'testnet', baseUrl?, timeoutMs?, maxRetries? });

velo.checkout.sessions.create(params: CreateCheckoutSessionParams, options?: RequestOptions): Promise<PaymentIntent>
velo.paymentIntents.retrieve(id: string, options?): Promise<PaymentIntent>
velo.paymentIntents.list(query?: { status?, limit?, cursor? }): Promise<{ data: PaymentIntent[]; hasMore; nextCursor }>
Velo.webhooks.verify({ payload: rawBody, signature: headerOrNull, secret, toleranceSeconds? }): Promise<WebhookEvent>
  // throws VeloWebhookSignatureVerificationError on a bad, missing or stale signature
```

```ts
type CreateCheckoutSessionParams = { amount: string; asset?: string; description?: string; successUrl?: string; cancelUrl?: string; anchor?: 'inhouse' | 'pdax' };
type RequestOptions = { idempotencyKey?: string; correlationId?: string; signal?: AbortSignal; timeoutMs?: number; maxRetries?: number };
type PaymentIntentStatus = 'awaiting_route' | 'created' | 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
type PaymentIntent = {
  id: string; object: 'payment_intent'; paymentIntentId: string; correlationId?: string | null;
  status: PaymentIntentStatus; amount: string; asset: string; description: string | null;
  checkoutUrl: string | null; successUrl: string | null; cancelUrl: string | null;
  anchor?: 'inhouse' | 'pdax'; receiverAddress?: string | null; receiverMemo?: string | null;
  payerAddress?: string | null; expiresAt: string; createdAt: string; updatedAt: string;
};
```

Use `asset: 'native'` for XLM (as in the handbook). `amount` is a decimal string, e.g. `fromStroops(130000000n)` → `'13'`.

### Webhooks

- Headers: `x-velo-signature` (verify against the **raw** body), `x-velo-delivery` (dedupe on it).
- Event envelope: `{ version: '1', id, type, test, sentAt, correlationId?, project: { id, registryProjectId, name, slug }, ... }`.
- Payment events (`payment.created` | `payment.succeeded` | `payment.failed` | `payment_access.activated`):
  `event.paymentIntent = { id, amount, asset, receiverAddress?, merchantName, description, status, payerAddress?, txHash?, createdAt, updatedAt }`.
- Other types: `contract.event` (`contractId`, `transactionHash`, `ledger`, `event: { id, topic, type, data, observedAt }`),
  `transaction.succeeded` / `transaction.failed`, `project.*`, `settlement.*`, `provider.pdax.event.received`.

Express pattern:

```ts
app.post('/webhooks/velo', express.raw({ type: 'application/json' }), async (req, res) => {
  const payload = req.body.toString('utf8');
  const sig = req.headers['x-velo-signature'];
  try {
    const event = await Velo.webhooks.verify({ payload, signature: Array.isArray(sig) ? sig[0] : sig ?? null, secret: process.env.VELO_WEBHOOK_SECRET! });
    // handle event
    res.status(200).send('ok');
  } catch (e) {
    if (e instanceof VeloWebhookSignatureVerificationError) return res.status(400).send('bad signature');
    throw e;
  }
});
```

### Errors

`VeloError` (base; `status`, `code`, `param`, `requestId`), `VeloAuthError`, `VeloValidationError`,
`VeloRateLimitError`, `VeloAPIError`, `VeloTimeoutError`, `VeloWebhookSignatureVerificationError`.

## Stellar Testnet

| Service | URL |
| --- | --- |
| Horizon | `https://horizon-testnet.stellar.org` |
| Soroban RPC | `https://soroban-testnet.stellar.org` |
| Friendbot | `https://friendbot.stellar.org?addr=<G…>` |
| Explorer | `https://stellar.expert/explorer/testnet` (`/tx/<hash>`, `/account/<G…>`, `/contract/<C…>`) |
