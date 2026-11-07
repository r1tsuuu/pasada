// Reads and validates environment variables. Secrets stay on the server; nothing here is ever logged.
import 'dotenv/config';

export type ChainMode = 'testnet' | 'fake';

function str(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

const DEMO_MODE = ['1', 'true'].includes(str('DEMO_MODE').toLowerCase());
/** Demo mode reads its own DEMO_* test keys, so it can never sign with the real program's wallets. */
const key = (name: string) => str(DEMO_MODE ? `DEMO_${name}` : name);

export const env = {
  DEMO_MODE,
  DEMO_TREASURER_SECRET: str('DEMO_TREASURER_SECRET'),
  CHAIN_MODE: (str('CHAIN_MODE', 'testnet') === 'fake' ? 'fake' : 'testnet') as ChainMode,
  PORT: Number(str('PORT', '8080')),
  WEB_ORIGIN: str('WEB_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  PUBLIC_WEB_URL: str('PUBLIC_WEB_URL', 'http://localhost:5173').replace(/\/$/, ''),
  PUBLIC_SERVER_URL: str('PUBLIC_SERVER_URL', `http://localhost:${str('PORT', '8080')}`).replace(/\/$/, ''),
  PROGRAM_OWNER_SECRET: key('PROGRAM_OWNER_SECRET'),
  AGENT_J1_SECRET: key('AGENT_J1_SECRET'),
  AGENT_J2_SECRET: key('AGENT_J2_SECRET'),
  AGENT_J3_SECRET: key('AGENT_J3_SECRET'),
  STATION_S1_SECRET: key('STATION_S1_SECRET'),
  STATION_S2_SECRET: key('STATION_S2_SECRET'),
  STATION_S3_PUBLIC: key('STATION_S3_PUBLIC'),
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
  if (env.DEMO_MODE && env.CHAIN_MODE === 'fake') {
    console.error('DEMO_MODE runs on Stellar Testnet. Unset CHAIN_MODE=fake.');
    process.exit(1);
  }
  if (env.CHAIN_MODE === 'fake') return;
  const missing: string[] = REQUIRED_CHAIN_KEYS.filter((k) => !env[k]);
  if (env.DEMO_MODE && !env.DEMO_TREASURER_SECRET) missing.push('DEMO_TREASURER_SECRET');
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} in apps/server/.env. Run ${env.DEMO_MODE ? 'npm run demo' : '\`npm run keys\`'} first (see README → Run it locally).`);
    process.exit(1);
  }
}
