import type { ApiConfig } from '@pasada/shared';
import { accountUrl, contractUrl } from '../format';

export function Header({ config }: { config: ApiConfig | null }) {
  return (
    <header className="border-b border-line bg-ink text-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 md:px-6">
        <div className="flex items-center gap-4">
          <div className="rounded-md bg-sign px-3 py-1 font-display text-3xl font-800 leading-none tracking-wide text-ink" style={{ fontWeight: 800 }}>
            Pasada
          </div>
          <p className="text-[15px] text-white/80">Fuel aid that only buys fuel</p>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm text-white/75">
          {config && (
            <>
              <span>{config.program.name}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.mode === 'fake' ? 'bg-capped-bg text-capped' : 'bg-ok-bg text-ok'}`}>
                {config.mode === 'fake' ? 'Offline simulation' : config.demo ? 'Demo mode · Stellar Testnet' : 'Stellar Testnet'}
              </span>
              <a className="underline-offset-2 hover:underline" href={contractUrl(config.contracts.paymentEscrow)} target="_blank" rel="noreferrer">
                Noir contracts
              </a>
              <a className="underline-offset-2 hover:underline" href={accountUrl(config.programOwnerPublicKey)} target="_blank" rel="noreferrer">
                Program wallet
              </a>
              <a className="underline-offset-2 hover:underline" href={config.repoUrl} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
