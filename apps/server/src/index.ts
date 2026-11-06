import { assertChainKeys, env } from './env';
import { createApp } from './app';
import { createContext } from './context';
import { startPoller } from './velo/poller';

assertChainKeys();

const ctx = await createContext();
ctx.stationAgent.start();
startPoller({ store: ctx.store, velo: ctx.velo, topups: ctx.topups, log: (e) => console.log(JSON.stringify(e)) });

const app = createApp(ctx);
app.listen(env.PORT, () => {
  console.log(`Pasada server on :${env.PORT} · chain: ${ctx.chain.mode} · velo: ${ctx.velo.mode}${ctx.velo.configured ? '' : ' (VELO_API_KEY missing)'}`);
  if (env.CHAIN_MODE === 'fake') console.log('FAKE MODE: in-memory chain and checkout. Nothing here touches Stellar or Velo.');
});

process.on('unhandledRejection', (err) => console.error('unhandledRejection', err));
