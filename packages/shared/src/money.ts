import { PROGRAM } from './config';

export const STROOPS_PER_XLM = 10_000_000n;

/** 120000000n → "12", 15000000n → "1.5". Exact, no floats. */
export function xlmString(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_XLM;
  const frac = abs % STROOPS_PER_XLM;
  let out = whole.toString();
  if (frac > 0n) {
    out += '.' + frac.toString().padStart(7, '0').replace(/0+$/, '');
  }
  return (negative ? '-' : '') + out;
}

/** 120000000n → "12 XLM" */
export function xlmLabel(stroops: bigint): string {
  return `${xlmString(stroops)} XLM`;
}

/** 120000000n → "₱1,440" at the demo rate. */
export function phpLabel(stroops: bigint, rate: number = PROGRAM.phpPerXlmDemoRate): string {
  // centavos = stroops * rate * 100 / 1e7, computed in bigint to stay exact
  const centavos = (stroops * BigInt(rate) * 100n) / STROOPS_PER_XLM;
  const negative = centavos < 0n;
  const abs = negative ? -centavos : centavos;
  const pesos = abs / 100n;
  const cents = abs % 100n;
  const pesoStr = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const centStr = cents === 0n ? '' : '.' + cents.toString().padStart(2, '0');
  return `${negative ? '-' : ''}₱${pesoStr}${centStr}`;
}

/** "₱1,440 (12 XLM)" */
export function moneyLabel(stroops: bigint): string {
  return `${phpLabel(stroops)} (${xlmLabel(stroops)})`;
}
