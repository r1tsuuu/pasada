// One-off check (plan T3): creates a 1 XLM Velo checkout and compares the receiver with the program owner.
// Run: npx tsx apps/server/scripts/velo-check.ts   (never prints the API key)
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Velo } from '@carts1024/velo-sdk';
import { Keypair } from '@stellar/stellar-sdk';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const apiKey = process.env.VELO_API_KEY;
if (!apiKey) throw new Error('VELO_API_KEY is empty in apps/server/.env');
const owner = Keypair.fromSecret(process.env.PROGRAM_OWNER_SECRET!).publicKey();

const velo = new Velo({ apiKey, environment: 'testnet', timeoutMs: 15_000, maxRetries: 1 });
const intent = await velo.checkout.sessions.create(
  { amount: '1', asset: 'native', description: 'Pasada Velo check' },
  { idempotencyKey: 'pasada-velo-check-' + Date.now() },
);
console.log('status         ', intent.status);
console.log('id             ', intent.id, '/', intent.paymentIntentId);
console.log('checkoutUrl    ', intent.checkoutUrl);
console.log('receiverAddress', intent.receiverAddress);
console.log('program owner  ', owner);
console.log('receiver is program owner:', intent.receiverAddress === owner);
