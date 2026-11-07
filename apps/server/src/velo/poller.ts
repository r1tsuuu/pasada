// Fallback for the Velo webhook: polls the status of open top-ups every 5 seconds.
import type { Logger, PasadaStore } from '@pasada/agent';
import type { VeloPort } from './client';
import type { TopUps } from './topups';

export function startPoller(deps: { store: PasadaStore; velo: VeloPort; topups: TopUps; log: Logger; everyMs?: number }): () => void {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      for (const t of deps.store.tranches.filter((x) => x.status === 'REQUESTED' && x.paymentIntentId)) {
        try {
          const info = await deps.velo.retrieve(t.paymentIntentId);
          if (info.status === 'paid') {
            await deps.topups.onIntentPaid(t.paymentIntentId, 'poll', { amount: info.amount, payerAddress: info.payerAddress, txHash: info.txHash });
          } else if (info.status === 'expired' || info.status === 'cancelled') {
            deps.store.updateTranche(t.id, { status: 'EXPIRED' });
          } else if (info.status === 'failed') {
            deps.store.updateTranche(t.id, { status: 'FAILED', error: 'Velo reported the payment failed' });
          }
        } catch (err) {
          deps.log({ kind: 'poll-error', tranche: t.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    } finally {
      busy = false;
    }
  }, deps.everyMs ?? 5_000);
  return () => clearInterval(timer);
}
