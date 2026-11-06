# Dev log

One line per surprise: where the real SDK, Velo dashboard or Testnet behaved differently from the
docs, and what we changed. Newest first.

- 2026-11-06 21:35 — Built in a workspace that can't reach Stellar or Velo. Everything is verified against `FakeChain`/`FakeVelo` (`npm run dev:fake`, `npm test`); the first real Testnet run is `npm run keys && npm run setup:chain && npm run smoke` on a laptop.
- 2026-11-06 21:30 — `@carts1024/velo-sdk@1.0.0` was published 2026-11-05 with the same API we use; we stay on `0.1.0-alpha.4` because the handbook says to use the alpha tag.
- 2026-11-06 21:25 — `NoirAgentClient.checkPayment` returns `expired` as a fallback reason when the contract refuses for a reason it can't see; we map `expired` to `PROGRAM_EXPIRED`.
- 2026-11-06 21:20 — Root `vite` (pulled in by vitest) and `apps/web` `vite` differ, so `vite.config.ts` is left out of the web `tsc` check; `vite build` still type-checks nothing and builds fine.
