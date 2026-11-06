import { useCallback, useEffect, useState } from 'react';
import type { ApiConfig, ApiState } from '@pasada/shared';
import { api } from './api';
import { Header } from './components/Header';
import { PumpPanel } from './components/PumpPanel';
import { DecisionFeed } from './components/DecisionFeed';
import { ProgramPanel } from './components/ProgramPanel';

export default function App() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [state, setState] = useState<ApiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch {
      setError(`Can't reach the Pasada server at ${api.base}. It may be waking up; this page retries every few seconds.`);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const loadConfig = async () => {
      try {
        const c = await api.config();
        if (alive) setConfig(c);
      } catch {
        if (alive) setTimeout(loadConfig, 3000);
      }
    };
    void loadConfig();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  // Back from Velo checkout
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const result = p.get('result');
    if (p.get('topup') && result) {
      setToast(result === 'success' ? 'Payment sent. Waiting for Velo to confirm it on the ledger, then the agent funds the escrow.' : 'Checkout cancelled. The top-up request is still open.');
      window.history.replaceState(null, '', window.location.pathname);
      setTimeout(() => setToast(null), 9000);
    }
  }, []);

  return (
    <div className="min-h-screen">
      <Header config={config} />
      {toast && (
        <div role="status" className="mx-auto mt-4 max-w-[1440px] px-4 md:px-6">
          <p className="rounded-xl bg-held-bg px-4 py-3 text-[15px] text-held">{toast}</p>
        </div>
      )}
      {error && (
        <div role="alert" className="mx-auto mt-4 max-w-[1440px] px-4 md:px-6">
          <p className="rounded-xl bg-refused-bg px-4 py-3 text-[15px] text-refused">{error}</p>
        </div>
      )}
      <main className="mx-auto grid max-w-[1440px] gap-8 px-4 py-6 md:px-6 lg:grid-cols-3 lg:gap-6 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)_minmax(340px,440px)] xl:gap-8">
        {config ? (
          <>
            <PumpPanel config={config} state={state} onDone={refresh} />
            <DecisionFeed config={config} state={state} />
            <ProgramPanel config={config} state={state} refresh={refresh} />
          </>
        ) : (
          <p className="text-ink-soft">Connecting to the Pasada server…</p>
        )}
      </main>
      <footer className="mx-auto max-w-[1440px] px-4 pb-8 text-xs text-ink-faint md:px-6">
        Stellar Testnet demo. Amounts use a demo rate of ₱120 = 1 XLM. Payments go through Noir's deployed contracts via @noirx402/agent-sdk; top-ups through Velo.
      </footer>
    </div>
  );
}
