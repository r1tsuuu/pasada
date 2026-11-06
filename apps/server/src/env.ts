// Reads and validates environment variables. Secrets stay on the server; nothing here is ever logged.
import 'dotenv/config';

export type ChainMode = 'testnet' | 'fake';

function str(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export const env = {
  CHAIN_MODE: (str('CHAIN_MODE', 'testnet') === 'fake' ? 'fake' : 'testnet') as ChainMode,
  PORT: Number(str('PORT', '8080')),
  WEB_ORIGIN: str('WEB_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  PUBLIC_WEB_URL: str('PUBLIC_WEB_URL', 'http://localhost:5173').replace(/\/$/, ''),
  PUBLIC_SERVER_URL: str('PUBLIC_SERVER_URL', `http://localhost:${str('PORT', '8080')}`).replace(/\/$/, ''),
  PROGRAM_OWNER_SECRET: str('PROGRAM_OWNER_SECRET'),
  AGENT_J1_SECRET: str('AGENT_J1_SECRET'),
  AGENT_J2_SECRET: str('AGENT_J2_SECRET'),
  AGENT_J3_SECRET: str('AGENT_J3_SECRET'),
  STATION_S1_SECRET: str('STATION_S1_SECRET'),
  STATION_S2_SECRET: str('STATION_S2_SECRET'),
  STATION_S3_PUBLIC: str('STATION_S3_PUBLIC'),
  VELO_API_KEY: str('VELO_API_KEY'),
  VELO_WEBHOOK_SECRET: str('VELO_WEBHOOK_SECRET'),
  VELO_BASE_URL: str('VELO_BASE_URL'),
  NOIR_RPC_URL: str('NOIR_RPC_URL'),
  ADMIN_TOKEN: str('ADMIN_TOKEN'),
  DATA_DIR: str('DATA_DIR', './data'),
  REPO_URL: str('REPO_URL', 'https://github.com/r1tsuuu/pasada'),
};

export const REQUIRED_CHAIN_KEYS = [
  'PROGRAM_OWNER_SECRET',
  'AGENT_J1_SECRET',
  'AGENT_J2_SECRET',
  'AGENT_J3_SECRET',
  'STATION_S1_SECRET',
  'STATION_S2_SECRET',
  'STATION_S3_PUBLIC',
] as const;

/** Exits with a clear message when a required key is missing (Testnet mode only). */
export function assertChainKeys() {
  if (env.CHAIN_MODE === 'fake') return;
  const missing = REQUIRED_CHAIN_KEYS.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} in apps/server/.env. Run \`npm run keys\` first (see README → Run it locally).`);
    process.exit(1);
  }
}
