import type { ApiConfig, ApiState } from '@pasada/shared';
import { DecisionCard } from './DecisionCard';

export function DecisionFeed({ config, state }: { config: ApiConfig; state: ApiState | null }) {
  const decisions = state?.decisions ?? [];
  return (
    <section aria-labelledby="feed-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="feed-title" className="font-display text-2xl font-bold">Agent decisions</h2>
        <span className="text-sm text-ink-faint">{decisions.length} so far</span>
      </div>
      {decisions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-6 text-[15px] text-ink-soft">
          No fills yet. Pick a station and a jeepney, then tap the card. Every decision shows up here with the rules the agent checked and its transaction on Stellar.
        </div>
      ) : (
        decisions.map((d) => <DecisionCard key={d.id} decision={d} config={config} />)
      )}
    </section>
  );
}
