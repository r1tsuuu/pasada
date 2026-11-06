import type { ProgramConfig, StationConfig, StationId, VehicleConfig, VehicleId } from './types';

/** Demo program. Subsidy ₱12/L is represented on Testnet as 0.1 XLM per liter (demo rate ₱120 = 1 XLM). */
export const PROGRAM: ProgramConfig = {
  name: 'QC Jeepney Fuel Aid (demo)',
  subsidyStroopsPerLiter: 1_000_000n,
  phpPerXlmDemoRate: 120,
  weeklyCapLiters: 150,
  refillWindowMinutes: 60,
  programEndsAt: new Date('2026-12-31T15:59:59Z'),
  trancheDays: 2,
  maxLitersPerRequest: 200,
};

export const VEHICLES: readonly VehicleConfig[] = [
  { id: 'J1', plate: 'NVE 1234', route: 'Cubao – Quiapo', tankLiters: 60, tagUid: '04A1B2C3D4E501', initialEscrowStroops: 120_000_000n },
  { id: 'J2', plate: 'TXR 5678', route: 'Fairview – Commonwealth', tankLiters: 50, tagUid: '04A1B2C3D4E502', initialEscrowStroops: 120_000_000n },
  { id: 'J3', plate: 'PUJ 9012', route: 'Novaliches – Blumentritt', tankLiters: 60, tagUid: '04A1B2C3D4E503', initialEscrowStroops: 30_000_000n },
];

export const STATIONS: readonly StationConfig[] = [
  { id: 'S1', name: 'Bituin Fuels — EDSA Cubao', accredited: true },
  { id: 'S2', name: 'Silangan Gas — Commonwealth', accredited: true },
  { id: 'S3', name: 'Kanto Fuel Depot', accredited: false },
];

export const VEHICLE_IDS: readonly VehicleId[] = VEHICLES.map((v) => v.id);
export const STATION_IDS: readonly StationId[] = STATIONS.map((s) => s.id);

export function findVehicle(id: string): VehicleConfig | undefined {
  return VEHICLES.find((v) => v.id === id);
}

export function findStation(id: string): StationConfig | undefined {
  return STATIONS.find((s) => s.id === id);
}

/** Noir per-payment cap for a vehicle: a full tank of subsidy. */
export function perFillCapStroops(vehicle: VehicleConfig, program: ProgramConfig = PROGRAM): bigint {
  return BigInt(vehicle.tankLiters) * program.subsidyStroopsPerLiter;
}

/** Below this balance the vehicle agent asks for a top-up: one full tank of subsidy. */
export function lowBalanceThresholdStroops(vehicle: VehicleConfig, program: ProgramConfig = PROGRAM): bigint {
  return perFillCapStroops(vehicle, program);
}

export const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet';

/** The deployed Noir Testnet contracts (also built into @noirx402/agent-sdk@0.3.0 as TESTNET). */
export const NOIR_CONTRACTS = {
  deviceRegistry: 'CAC4KOLHDLDYDWBOKXNKRN5KVHO56PLOIFXDLTBUWGVN6GVDEB7FQHU5',
  agentRegistry: 'CCMZDSPTLX7IIJWCYEUM5DJUHOSOYSTHGK777S2TXZWEMC5ZZGPJ3EBV',
  paymentEscrow: 'CC7EAW5FNJEDBS7THM5IT6XIOHO4AOYMLXT3KSZ3HWUIKEACTW7E5BFS',
} as const;
