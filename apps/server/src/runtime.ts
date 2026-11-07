// Builds the chain client and the on-chain identities of the demo jeepneys and stations.
// Shared by the server and the setup scripts.
import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { FakeChain, NoirChain, deviceHashFromUid } from '@pasada/agent';
import type { ChainPort, StationRuntime, VehicleRuntime } from '@pasada/agent';
import { PROGRAM, STATIONS, VEHICLES, perFillCapStroops } from '@pasada/shared';
import { env } from './env';

export interface Runtime {
  chain: ChainPort;
  ownerSecret: string;
  ownerPublicKey: string;
  vehicles: VehicleRuntime[];
  stations: StationRuntime[];
}

const AGENT_SECRET = { J1: 'AGENT_J1_SECRET', J2: 'AGENT_J2_SECRET', J3: 'AGENT_J3_SECRET' } as const;

export function buildRuntime(): Runtime {
  const fake = env.CHAIN_MODE === 'fake';
  // In fake mode, missing keys are replaced by throwaway keys that never touch a network.
  const secret = (name: keyof typeof env) => (env[name] as string) || (fake ? Keypair.random().secret() : '');

  const chain: ChainPort = fake ? new FakeChain(1200) : new NoirChain({ rpcUrl: env.NOIR_RPC_URL || undefined });
  const ownerSecret = secret('PROGRAM_OWNER_SECRET');
  const ownerPublicKey = Keypair.fromSecret(ownerSecret).publicKey();
  // The real cards are registered to the real program wallet, so demo wallets get their own card UIDs.
  const tagUid = (uid: string) => (env.DEMO_MODE ? createHash('sha256').update(`${uid}:${ownerPublicKey}`).digest('hex').slice(0, 14).toUpperCase() : uid);

  const vehicles: VehicleRuntime[] = VEHICLES.map((v) => {
    const agentSecret = secret(AGENT_SECRET[v.id]);
    return { ...v, tagUid: tagUid(v.tagUid), deviceHash: deviceHashFromUid(tagUid(v.tagUid)), agentSecret, agentPublicKey: Keypair.fromSecret(agentSecret).publicKey() };
  });

  const stations: StationRuntime[] = STATIONS.map((s) => {
    if (s.id === 'S3') {
      return { ...s, publicKey: env.STATION_S3_PUBLIC || Keypair.random().publicKey() };
    }
    const sec = secret(s.id === 'S1' ? 'STATION_S1_SECRET' : 'STATION_S2_SECRET');
    return { ...s, secret: sec, publicKey: Keypair.fromSecret(sec).publicKey() };
  });

  return { chain, ownerSecret, ownerPublicKey, vehicles, stations };
}

/** Fake mode only: register and fund the demo jeepneys in the in-memory chain, as setup:chain does on Testnet. */
export async function seedFakeChain(rt: Runtime) {
  const chain = rt.chain as FakeChain;
  const latency = chain.latencyMs;
  chain.latencyMs = 0;
  for (const v of rt.vehicles) {
    await chain.registerDevice({ ownerSecret: rt.ownerSecret, deviceHash: v.deviceHash, agent: v.agentPublicKey });
    await chain.registerAgent({ ownerSecret: rt.ownerSecret, deviceHash: v.deviceHash, agent: v.agentPublicKey, maxAmount: perFillCapStroops(v), expiresAt: PROGRAM.programEndsAt });
    await chain.fundEscrow({ ownerSecret: rt.ownerSecret, deviceHash: v.deviceHash, amount: v.initialEscrowStroops });
  }
  chain.latencyMs = latency;
}
