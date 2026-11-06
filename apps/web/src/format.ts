import type { ApiMoney, Outcome } from '@pasada/shared';

export const EXPLORER = 'https://stellar.expert/explorer/testnet';

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const accountUrl = (g: string) => `${EXPLORER}/account/${g}`;
export const contractUrl = (c: string) => `${EXPLORER}/contract/${c}`;

export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export function money(m: ApiMoney | null | undefined): string {
  if (!m) return '—';
  return `${m.php} (${m.xlm} XLM)`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  APPROVED: 'Paid',
  APPROVED_CAPPED: 'Paid, capped',
  HELD: 'Held',
  REFUSED: 'Refused',
  FAILED: 'Failed',
};

export const OUTCOME_STYLE: Record<Outcome, string> = {
  APPROVED: 'bg-ok-bg text-ok',
  APPROVED_CAPPED: 'bg-capped-bg text-capped',
  HELD: 'bg-held-bg text-held',
  REFUSED: 'bg-refused-bg text-refused',
  FAILED: 'bg-failed-bg text-failed',
};
