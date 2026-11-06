// npm run keys — creates any missing Testnet keypairs, funds them with Friendbot, and writes them
// into apps/server/.env without touching values that are already set. Never prints a secret.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const examplePath = fileURLToPath(new URL('../.env.example', import.meta.url));
const EXPLORER = 'https://stellar.expert/explorer/testnet/account/';

const ROLES = [
  { name: 'PROGRAM_OWNER_SECRET', label: 'Program owner', fund: true },
  { name: 'AGENT_J1_SECRET', label: 'J1 vehicle agent', fund: true },
  { name: 'AGENT_J2_SECRET', label: 'J2 vehicle agent', fund: true },
  { name: 'AGENT_J3_SECRET', label: 'J3 vehicle agent', fund: true },
  { name: 'STATION_S1_SECRET', label: 'S1 station', fund: true },
  { name: 'STATION_S2_SECRET', label: 'S2 station', fund: true },
  { name: 'STATION_S3_PUBLIC', label: 'S3 station (not accredited)', fund: false },
] as const;

async function friendbot(publicKey: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
      if (res.ok) return true;
      const text = await res.text();
      if (text.includes('createAccountAlreadyExist')) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

if (!existsSync(envPath)) copyFileSync(examplePath, envPath);
let text = readFileSync(envPath, 'utf8');

function current(name: string): string {
  const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

function set(name: string, value: string) {
  const re = new RegExp(`^${name}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${name}=${value}`) : `${text.trimEnd()}\n${name}=${value}\n`;
}

console.log('Pasada Testnet accounts\n');
for (const role of ROLES) {
  const existing = current(role.name);
  let publicKey: string;
  let created = false;
  if (existing) {
    publicKey = role.name.endsWith('_PUBLIC') ? existing : Keypair.fromSecret(existing).publicKey();
  } else {
    const kp = Keypair.random();
    publicKey = kp.publicKey();
    set(role.name, role.name.endsWith('_PUBLIC') ? publicKey : kp.secret());
    created = true;
  }
  let funded = '';
  if (role.fund) funded = (await friendbot(publicKey)) ? 'funded' : 'FRIENDBOT FAILED (re-run npm run keys)';
  console.log(`${role.label.padEnd(30)} ${created ? 'new     ' : 'existing'} ${funded.padEnd(10)} ${EXPLORER}${publicKey}`);
}

writeFileSync(envPath, text);
console.log(`\nSaved to apps/server/.env (git-ignored). Next: npm run setup:chain`);
