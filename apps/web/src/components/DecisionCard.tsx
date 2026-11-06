import { useState } from 'react';
import type { ApiConfig, ApiDecision } from '@pasada/shared';
import { OUTCOME_LABEL, OUTCOME_STYLE, shortHash, timeAgo, txUrl } from '../format';

export function DecisionCard({ decision: d, config, highlight }: { decision: ApiDecision; config: ApiConfig; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const vehicle = config.vehicles.find((v) => v.id === d.vehicleId);
  const station = config.stations.find((s) => s.id === d.stationId);
  const paid = d.outcome === 'APPROVED' || d.outcome === 'APPROVED_CAPPED';

  return (
    <article className={`rounded-xl border bg-panel p-4 ${highlight ? 'border-ink' : 'border-line'} ${highlight ? 'arrive' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${OUTCOME_STYLE[d.outcome]}`}>{OUTCOME_LABEL[d.outcome]}</span>
        <span className="font-display text-lg font-bold">{vehicle?.plate ?? d.vehicleId}</span>
        <span className="text-sm text-ink-soft">at {station?.name ?? d.stationId}</span>
        <span className="ml-auto text-xs text-ink-faint">{timeAgo(d.createdAt)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular text-sm text-ink-soft">
          Asked {d.requestedLiters} L{paid ? ` · paid for ${d.approvedLiters} L` : ''}
        </span>
        {paid && <span className="tabular font-display text-xl font-semibold">{d.amount.php} <span className="text-base text-ink-soft">({d.amount.xlm} XLM)</span></span>}
      </div>

      <p className="mt-2 text-[15px] leading-relaxed">{d.explanation}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {d.authorizeTxHash && (
          <a className="font-medium text-held underline underline-offset-2" href={txUrl(d.authorizeTxHash)} target="_blank" rel="noreferrer">
            Payment tx {shortHash(d.authorizeTxHash)}
          </a>
        )}
        {d.authorizeTxHash &&
          (d.claimTxHash ? (
            <a className="font-medium text-held underline underline-offset-2" href={txUrl(d.claimTxHash)} target="_blank" rel="noreferrer">
              Station claim tx {shortHash(d.claimTxHash)}
            </a>
          ) : (
            <span className="text-ink-faint">Station agent claiming…</span>
          ))}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto text-ink-soft underline underline-offset-2">
          {open ? 'Hide rules checked' : `Rules checked (${d.checks.length})`}
        </button>
      </div>

      {open && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-sm">
          {d.checks.map((c) => (
            <li key={c.rule} className="flex gap-3 px-3 py-2">
              <span aria-hidden className={`mt-0.5 font-bold ${c.passed ? 'text-ok' : 'text-refused'}`}>{c.passed ? '✓' : '✗'}</span>
              <div className="flex-1">
                <div className="font-medium">
                  {c.label} <span className={c.passed ? 'text-ok' : 'text-refused'}>{c.passed ? 'passed' : 'failed'}</span>
                </div>
                <div className="text-ink-soft">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
