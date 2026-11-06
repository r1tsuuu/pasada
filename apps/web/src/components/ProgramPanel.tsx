import { useState } from 'react';
import type { ApiConfig, ApiState, ApiTranche } from '@pasada/shared';
import { api } from '../api';
import { money, shortHash, timeAgo, txUrl } from '../format';

const TRANCHE_LABEL: Record<ApiTranche['status'], string> = {
  REQUESTED: 'Waiting for payment',
  PAID: 'Paid · funding escrow',
  FUNDED: 'Funded',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

const TRANCHE_STYLE: Record<ApiTranche['status'], string> = {
  REQUESTED: 'bg-capped-bg text-capped',
  PAID: 'bg-held-bg text-held',
  FUNDED: 'bg-ok-bg text-ok',
  FAILED: 'bg-refused-bg text-refused',
  EXPIRED: 'bg-failed-bg text-failed',
};

function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper" role="presentation">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgramPanel({ config, state, refresh }: { config: ApiConfig; state: ApiState | null; refresh: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function act(id: string, fn: () => Promise<unknown>, done: string) {
    setBusyId(id);
    setNote(null);
    try {
      await fn();
      setNote(done);
      refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusyId(null);
    }
  }

  const vehicles = state?.vehicles ?? [];
  const tranches = state?.tranches ?? [];
  const held = (state?.held ?? []).filter((h) => h.status === 'NEEDS_REVIEW' || h.status === 'AWAITING_FUNDS');
  const plate = (id: string) => config.vehicles.find((v) => v.id === id)?.plate ?? id;
  const stationName = (id: string) => config.stations.find((s) => s.id === id)?.name ?? id;

  return (
    <section aria-labelledby="program-title" className="flex flex-col gap-5">
      <h2 id="program-title" className="font-display text-2xl font-bold">Program office</h2>
      {note && <p role="status" className="rounded-lg bg-held-bg px-3 py-2 text-sm text-held">{note}</p>}

      <div className="flex flex-col gap-3">
        {vehicles.map((v) => {
          const escrowX = v.escrow ? Number(v.escrow.stroops) : 0;
          const threshold = Number(v.lowBalanceThreshold.stroops);
          return (
            <div key={v.id} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="font-display text-xl font-bold">{v.plate}</span>
                  <span className="ml-2 text-sm text-ink-faint">{v.route}</span>
                </div>
                {v.isLow && <span className="rounded-full bg-capped-bg px-2 py-0.5 text-xs font-semibold text-capped">Low balance</span>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-ink-soft">Fuel-aid escrow</div>
                  <div className="tabular font-display text-2xl font-semibold">{v.escrow ? v.escrow.php : '—'}</div>
                  <div className="text-xs text-ink-faint">{v.escrow ? `${v.escrow.xlm} XLM · tops up below ${v.lowBalanceThreshold.php}` : 'Reading Noir…'}</div>
                  <div className="mt-1.5"><Bar value={escrowX} max={threshold * 2.5} tone={v.isLow ? 'bg-capped' : 'bg-ok'} /></div>
                </div>
                <div>
                  <div className="text-ink-soft">This week</div>
                  <div className="tabular font-display text-2xl font-semibold">{v.weeklyUsedLiters} / {v.weeklyCapLiters} L</div>
                  <div className="text-xs text-ink-faint">Cap per fill {v.policy ? v.policy.maxAmount.php : '—'}</div>
                  <div className="mt-1.5"><Bar value={v.weeklyUsedLiters} max={v.weeklyCapLiters} tone="bg-ink" /></div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={busyId === v.id}
                  onClick={() => act(v.id, async () => {
                    const r = await api.checkBalance(v.id);
                    if (!r.tranche) throw new Error(`${v.plate}: balance is fine, no top-up needed.`);
                  }, `${v.plate}: the agent requested a top-up.`)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-ink disabled:opacity-60"
                >
                  Ask the agent to check its balance
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="font-display text-xl font-bold">Top-up requests</h3>
        <p className="text-sm text-ink-soft">The agent asks for money through a Velo checkout. Pay it with the treasurer's Testnet wallet.</p>
        <div className="mt-2 flex flex-col gap-2">
          {tranches.length === 0 && <p className="rounded-lg border border-dashed border-line bg-panel p-3 text-sm text-ink-faint">No requests yet. They appear when a jeepney's escrow runs low.</p>}
          {tranches.map((t) => (
            <div key={t.id} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${TRANCHE_STYLE[t.status]}`}>{TRANCHE_LABEL[t.status]}</span>
                <span className="font-display text-lg font-bold">{plate(t.vehicleId)}</span>
                <span className="tabular ml-auto font-display text-xl font-semibold">{money(t.amount)}</span>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed">“{t.rationale}”</p>
              {t.error && <p className="mt-1 text-sm text-refused">{t.error}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {t.status === 'REQUESTED' && t.checkoutUrl && (
                  <a href={t.checkoutUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white hover:bg-ink-soft">
                    Open Velo checkout
                  </a>
                )}
                {t.confirmedVia && <span className="text-ink-soft">Confirmed by Velo {t.confirmedVia === 'webhook' ? 'signed webhook' : 'status check'}</span>}
                {t.fundTxHash && (
                  <a className="font-medium text-held underline underline-offset-2" href={txUrl(t.fundTxHash)} target="_blank" rel="noreferrer">
                    Escrow funded tx {shortHash(t.fundTxHash)}
                  </a>
                )}
                <span className="ml-auto text-xs text-ink-faint">{timeAgo(t.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display text-xl font-bold">Held fills</h3>
        <div className="mt-2 flex flex-col gap-2">
          {held.length === 0 && <p className="rounded-lg border border-dashed border-line bg-panel p-3 text-sm text-ink-faint">Nothing held right now.</p>}
          {held.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-3 text-sm">
              <div className="flex-1">
                <span className="font-display text-lg font-bold">{plate(h.vehicleId)}</span>{' '}
                <span className="text-ink-soft">{h.requestedLiters} L at {stationName(h.stationId)}</span>
                <div className="text-ink-faint">{h.reason === 'TOO_SOON' ? 'Needs your review: second fill within the hour' : 'Waiting for the top-up to arrive'}</div>
              </div>
              {h.status === 'NEEDS_REVIEW' && (
                <div className="flex gap-2">
                  <button type="button" disabled={busyId === h.id} onClick={() => act(h.id, () => api.approveHeld(h.id), 'Approved. The agent paid the station.')} className="rounded-lg bg-ok px-3 py-1.5 font-semibold text-white disabled:opacity-60">
                    Approve
                  </button>
                  <button type="button" disabled={busyId === h.id} onClick={() => act(h.id, () => api.rejectHeld(h.id), 'Rejected. No payment made.')} className="rounded-lg border border-line px-3 py-1.5 font-semibold hover:border-refused hover:text-refused disabled:opacity-60">
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display text-xl font-bold">Stations</h3>
        <table className="mt-2 w-full overflow-hidden rounded-xl border border-line bg-panel text-sm">
          <thead className="bg-paper text-left text-ink-soft">
            <tr><th className="px-3 py-2 font-medium">Station</th><th className="px-3 py-2 font-medium">Waiting to claim</th><th className="px-3 py-2 font-medium">Claimed today</th></tr>
          </thead>
          <tbody>
            {(state?.stations ?? []).map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-3 py-2">{s.name}{!s.accredited && <span className="ml-1 text-refused">(not accredited)</span>}</td>
                <td className="tabular px-3 py-2">{s.accredited ? (s.pending ? s.pending.php : '—') : '—'}</td>
                <td className="tabular px-3 py-2">{s.claimedToday.php}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-display text-xl font-bold">On-chain and Velo events</h3>
        <ul className="mt-2 max-h-80 divide-y divide-line overflow-auto rounded-xl border border-line bg-panel text-sm">
          {(state?.events ?? []).length === 0 && <li className="p-3 text-ink-faint">Events from Noir's contracts and Velo appear here.</li>}
          {(state?.events ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${e.source === 'velo' ? 'bg-capped-bg text-capped' : 'bg-held-bg text-held'}`}>{e.source === 'velo' ? 'Velo' : 'Noir'}</span>
              <span className="font-medium">{e.type}</span>
              {e.vehicleId && <span className="text-ink-soft">{plate(e.vehicleId)}</span>}
              {e.stationId && <span className="text-ink-soft">{stationName(e.stationId).split(' — ')[0]}</span>}
              {e.amount && <span className="tabular text-ink-soft">{e.amount.php}</span>}
              <span className="ml-auto flex items-center gap-3 text-xs text-ink-faint">
                {e.ledger > 0 && <span>ledger {e.ledger}</span>}
                {e.txHash && <a className="text-held underline" href={txUrl(e.txHash)} target="_blank" rel="noreferrer">{shortHash(e.txHash)}</a>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
