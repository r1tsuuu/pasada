// npm run setup:chain [-- --reset-j3]
// Registers the demo jeepneys on Noir's deployed Testnet contracts, sets each vehicle agent's policy,
// and funds the escrows. Idempotent: every step reads the chain first and only writes what is missing.
import { fromStroops } from '@noirx402/agent-sdk';
import { PROGRAM, perFillCapStroops } from '@pasada/shared';
import { assertChainKeys, env } from '../src/env';
import { buildRuntime } from '../src/runtime';
import { recordProof } from './proof';

if (env.CHAIN_MODE === 'fake') {
  console.error('setup:chain talks to Stellar Testnet. Unset CHAIN_MODE=fake.');
  process.exit(1);
}
assertChainKeys();

const resetJ3 = process.argv.includes('--reset-j3');
const rt = buildRuntime();
const { chain, ownerSecret, ownerPublicKey } = rt;
console.log(`Program owner ${ownerPublicKey}\n`);

for (const v of rt.vehicles) {
  console.log(`${v.id} ${v.plate} · card ${v.tagUid} · device ${v.deviceHash.slice(0, 12)}…`);

  // 1. device_registry: link the card to the program wallet and this vehicle's agent key
  const owner = await chain.getDeviceOwner(v.deviceHash);
  if (owner === null) {
    const { hash } = await chain.registerDevice({ ownerSecret, deviceHash: v.deviceHash, agent: v.agentPublicKey });
    recordProof(`${v.id} registerDevice`, hash);
  } else if (owner !== ownerPublicKey) {
    console.error(`  Card already registered to ${owner}. Change ${v.id}'s tagUid in packages/shared/src/config.ts.`);
    process.exit(1);
  } else {
    console.log('  device: already registered');
  }

  // 2. agent_registry: per-fill cap = tank × subsidy, expiry = program end
  const cap = perFillCapStroops(v);
  const policy = await chain.getPolicy(v.deviceHash);
  const policyOk =
    policy &&
    policy.agent === v.agentPublicKey &&
    policy.maxAmount === cap &&
    policy.asset === chain.asset &&
    policy.expiresAt?.getTime() === PROGRAM.programEndsAt.getTime();
  if (!policyOk) {
    const { hash } = await chain.registerAgent({ ownerSecret, deviceHash: v.deviceHash, agent: v.agentPublicKey, maxAmount: cap, expiresAt: PROGRAM.programEndsAt });
    recordProof(`${v.id} registerAgent (cap ${fromStroops(cap)} XLM)`, hash);
  } else {
    console.log(`  policy: ok (cap ${fromStroops(cap)} XLM, expires ${PROGRAM.programEndsAt.toISOString()})`);
  }

  // 3. payment_escrow: fund up to the starting balance (J3 can be reset down to 3 XLM for scenario S5)
  const balance = await chain.getEscrowBalance(v.deviceHash);
  if (resetJ3 && v.id === 'J3' && balance > v.initialEscrowStroops) {
    const { hash } = await chain.defundEscrow({ ownerSecret, deviceHash: v.deviceHash, amount: balance - v.initialEscrowStroops });
    recordProof(`${v.id} defundEscrow back to ${fromStroops(v.initialEscrowStroops)} XLM`, hash);
  } else if (balance < v.initialEscrowStroops) {
    const { hash } = await chain.fundEscrow({ ownerSecret, deviceHash: v.deviceHash, amount: v.initialEscrowStroops - balance });
    recordProof(`${v.id} fundEscrow ${fromStroops(v.initialEscrowStroops - balance)} XLM`, hash);
  } else {
    console.log(`  escrow: ${fromStroops(balance)} XLM`);
  }
  console.log('');
}

console.log('Done. Next: npm run smoke');
