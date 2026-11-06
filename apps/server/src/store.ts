// Persists the agents' store to DATA_DIR/state.json (debounced). The chain stays the source of truth for money.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PasadaStore, parseSnapshot, stringifySnapshot } from '@pasada/agent';
import { env } from './env';

export function createPersistentStore(): PasadaStore {
  const store = new PasadaStore();
  const dir = resolve(env.DATA_DIR);
  const file = join(dir, env.CHAIN_MODE === 'fake' ? 'state.fake.json' : 'state.json');

  if (env.CHAIN_MODE !== 'fake' && existsSync(file)) {
    try {
      store.load(parseSnapshot(readFileSync(file, 'utf8')));
      console.log(`Loaded ${store.decisions.length} decisions from ${file}`);
    } catch (err) {
      console.warn(`Could not read ${file}; starting empty`, err);
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  store.onChange(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, stringifySnapshot(store.snapshot()));
      } catch (err) {
        console.warn('Could not save state', err);
      }
    }, 500);
  });
  return store;
}
