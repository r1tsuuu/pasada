import type { StationConfig, VehicleConfig } from '@pasada/shared';

/** A vehicle with its on-chain identity. The secret never leaves the server. */
export interface VehicleRuntime extends VehicleConfig {
  deviceHash: string;
  agentPublicKey: string;
  agentSecret: string;
}

/** A station with its address. Accredited stations also have a secret so their agent can claim. */
export interface StationRuntime extends StationConfig {
  publicKey: string;
  secret?: string;
}

export type Logger = (entry: Record<string, unknown>) => void;

export const jsonLogger: Logger = (entry) => {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
};
