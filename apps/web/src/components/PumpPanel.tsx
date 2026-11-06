import { useEffect, useState } from 'react';
import type { ApiConfig, ApiDecision, ApiState } from '@pasada/shared';
import { api } from '../api';
import { DecisionCard } from './DecisionCard';

const STEPS = ['Reading the card', 'Agent checking the rules', 'Noir: checkPayment', 'Noir: authorizePayment'];
const QUICK = [20, 40, 60, 80];

export function PumpPanel({ config, state, onDone }: { config: ApiConfig; state: ApiState | null; onDone: () => void }) {
  const [stationId, setStationId] = useState('S1');
  const [vehicleId, setVehicleId] = useState('J1');
  const [liters, setLiters] = useState(40);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ApiDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1100);
    return () => clearInterval(t);
  }, [busy]);

  const station = config.stations.find((s) => s.id === stationId)!;
  const subsidyPhp = (liters * Number(config.program.subsidyPerLiter.stroops) * config.program.phpPerXlmDemoRate) / 1e7;

  async function tap() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { decision } = await api.fill(vehicleId, stationId, liters);
      setResult(decision);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The server did not answer. Check that it is running.');
    } finally {
      setBusy(false);
    }
  }

  // Keep the result card fresh (the claim link appears a few seconds after payment).
  const live = result ? state?.decisions.find((d) => d.id === result.id) ?? result : null;

  return (
    <section aria-labelledby="pump-title" className="flex flex-col gap-4">
      <h2 id="pump-title" className="font-display text-2xl font-bold">At the pump</h2>

      <fieldset className="rounded-xl border border-line bg-panel p-4">
        <legend className="px-1 text-sm font-semibold text-ink-soft">Station</legend>
        <div className="flex flex-col gap-2">
          {config.stations.map((s) => (
            <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${stationId === s.id ? 'border-ink bg-paper' : 'border-line'}`}>
              <input type="radio" name="station" value={s.id} checked={stationId === s.id} onChange={() => setStationId(s.id)} className="accent-ink" />
              <span className="flex-1 text-[15px]">{s.name}</span>
              {!s.accredited && <span className="rounded-full bg-refused-bg px-2 py-0.5 text-xs font-semibold text-refused">Not accredited</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-line bg-panel p-4">
        <legend className="px-1 text-sm font-semibold text-ink-soft">Jeepney card</legend>
        <div className="grid grid-cols-3 gap-2">
          {config.vehicles.map((v) => {
            const vs = state?.vehicles.find((x) => x.id === v.id);
            const selected = vehicleId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVehicleId(v.id)}
                aria-pressed={selected}
                className={`rounded-lg border px-2.5 py-2 text-left ${selected ? 'border-ink bg-ink text-white' : 'border-line bg-panel hover:border-ink-faint'}`}
              >
                <div className="font-display text-lg font-bold leading-tight">{v.plate}</div>
                <div className={`text-xs leading-snug ${selected ? 'text-white/75' : 'text-ink-faint'}`}>{v.route}</div>
                <div className={`mt-1 text-xs ${selected ? 'text-white/90' : 'text-ink-soft'}`}>
                  {v.tankLiters} L tank · {vs?.escrow ? vs.escrow.php : '…'}
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* The pump console: the one loud element on the page */}
      <div className="rounded-2xl bg-display p-4 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor="liters" className="text-sm text-white/70">Liters</label>
          <span className="text-sm text-white/70">Subsidy at ₱{(Number(config.program.subsidyPerLiter.stroops) * config.program.phpPerXlmDemoRate / 1e7).toFixed(0)}/L</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <input
            id="liters"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            step={1}
            value={liters}
            onChange={(e) => setLiters(Math.trunc(Number(e.target.value)))}
            className="tabular w-36 bg-transparent font-display text-7xl font-semibold leading-none text-display-glow outline-none"
            aria-describedby="liters-help"
          />
          <div className="tabular text-right font-display text-4xl font-semibold text-display-glow/90">₱{subsidyPhp.toLocaleString('en-PH')}</div>
        </div>
        <p id="liters-help" className="sr-only">Whole liters from 1 to 200</p>
        <div className="mt-3 flex gap-2">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setLiters(q)} className={`flex-1 rounded-md border px-2 py-1.5 font-display text-lg font-semibold ${liters === q ? 'border-display-glow text-display-glow' : 'border-white/20 text-white/80 hover:border-white/50'}`}>
              {q} L
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={tap}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-sign py-4 font-display text-2xl font-bold text-ink transition-colors hover:bg-sign-deep disabled:cursor-wait disabled:opacity-80"
        >
          {busy ? 'Agent is deciding…' : 'Tap jeepney card'}
        </button>
        <p className="mt-2 text-center text-xs text-white/60">The driver only taps. The jeepney's agent decides and pays {station.name.split(' — ')[0]}.</p>
      </div>

      {busy && (
        <ol className="rounded-xl border border-line bg-panel p-4 text-sm" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 py-0.5 ${i <= step ? 'text-ink' : 'text-ink-faint'}`}>
              <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${i < step ? 'bg-ok' : i === step ? 'animate-pulse bg-sign-deep' : 'bg-line'}`} />
              {s}
            </li>
          ))}
        </ol>
      )}

      {error && <p role="alert" className="rounded-xl bg-refused-bg p-3 text-sm text-refused">{error}</p>}
      {live && !busy && <DecisionCard decision={live} config={config} highlight />}
    </section>
  );
}
