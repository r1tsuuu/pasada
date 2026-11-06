// npm run smoke — the first real proof: J1's agent pays S1 0.1 XLM through Noir, then S1 claims it.
import { toStroops } from '@noirx402/agent-sdk';
import { assertChainKeys, env } from '../src/env';
import { buildRuntime } from '../src/runtime';
import { recordProof } from './proof';

if (env.CHAIN_MODE === 'fake') {
  console.error('smoke talks to Stellar Testnet. Unset CHAIN_MODE=fake.');
  process.exit(1);
}
assertChainKeys();

const rt = buildRuntime();
const j1 = rt.vehicles.find((v) => v.id === 'J1')!;
const s1 = rt.stations.find((s) => s.id === 'S1')!;
const amount = toStroops('0.1');

const check = await rt.chain.checkPayment({ deviceHash: j1.deviceHash, agent: j1.agentPublicKey, amount });
console.log('checkPayment:', check);
if (!check.ok) {
  console.error('Refused. Did you run npm run setup:chain?');
  process.exit(1);
}

const paid = await rt.chain.authorizePayment({ agentSecret: j1.agentSecret, deviceHash: j1.deviceHash, merchant: s1.publicKey, amount });
recordProof('smoke: J1 agent authorizePayment 0.1 XLM to S1', paid.hash);

await new Promise((r) => setTimeout(r, 6000));
const pending = await rt.chain.getPendingBalance(s1.publicKey);
console.log(`S1 pending: ${pending} stroops`);
const claimed = await rt.chain.claim({ merchantSecret: s1.secret! });
recordProof('smoke: S1 station claim', claimed.hash);
console.log('Smoke test passed.');
