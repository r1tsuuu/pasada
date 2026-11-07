// Wires the runtime, store, agents and Velo together. One instance per server process.
import { jsonLogger, StationAgent, VehicleAgent } from '@pasada/agent';
import type { PasadaStore } from '@pasada/agent';
import { PROGRAM } from '@pasada/shared';
import { env } from './env';
import { seedDemoData } from './demoSeed';
import { buildRuntime, seedFakeChain, type Runtime } from './runtime';
import { createPersistentStore } from './store';
import { FakeVelo, RealVelo, type VeloPort } from './velo/client';
import { DemoVelo } from './velo/demoVelo';
import { TopUps } from './velo/topups';

export interface AppContext extends Runtime {
  store: PasadaStore;
  velo: VeloPort;
  topups: TopUps;
  vehicleAgent: VehicleAgent;
  stationAgent: StationAgent;
  cache: ReadCache;
}

/** Caches chain reads for a few seconds so the web's 2-second polling doesn't hammer the RPC. */
export class ReadCache {
  private entries = new Map<string, { at: number; value: Promise<unknown> }>();
  constructor(private readonly ttlMs = 4_000) {}

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as Promise<T>;
    const value = load();
    this.entries.set(key, { at: Date.now(), value });
    value.catch(() => this.entries.delete(key));
    return value;
  }

  clear() {
    this.entries.clear();
  }
}

export async function createContext(): Promise<AppContext> {
  const rt = buildRuntime();
  if (env.CHAIN_MODE === 'fake') await seedFakeChain(rt);

  const store = createPersistentStore();
  if (env.DEMO_MODE) seedDemoData(store);
  const velo: VeloPort = env.DEMO_MODE ? new DemoVelo(env.DEMO_TREASURER_SECRET, rt.ownerPublicKey) : env.CHAIN_MODE === 'fake' ? new FakeVelo() : new RealVelo();
  const log = jsonLogger;
  const cache = new ReadCache();

  const topups = new TopUps({
    chain: rt.chain, store, velo, program: PROGRAM, vehicles: rt.vehicles,
    ownerSecret: rt.ownerSecret, ownerPublicKey: rt.ownerPublicKey, publicWebUrl: env.PUBLIC_WEB_URL, log,
  });

  const stationAgent = new StationAgent({ chain: rt.chain, store, stations: rt.stations, vehicles: rt.vehicles, log });

  const vehicleAgent = new VehicleAgent({
    chain: rt.chain, store, program: PROGRAM, vehicles: rt.vehicles, stations: rt.stations,
    ensureTopUp: topups.ensureTopUp,
    onPaid: (stationId) => {
      cache.clear();
      stationAgent.nudge(stationId);
    },
    log,
  });
  topups.attachAgent(vehicleAgent);

  return { ...rt, store, velo, topups, vehicleAgent, stationAgent, cache };
}
