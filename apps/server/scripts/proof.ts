// Appends a line to docs/testnet-proof.md for every real Testnet transaction the scripts make.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const proofPath = fileURLToPath(new URL('../../../docs/testnet-proof.md', import.meta.url));

export function txLink(hash: string) {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function recordProof(what: string, hash: string) {
  const when = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour12: false });
  appendFileSync(proofPath, `| ${when} | ${what} | ${txLink(hash)} |\n`);
  console.log(`  ${what}: ${txLink(hash)}`);
}
