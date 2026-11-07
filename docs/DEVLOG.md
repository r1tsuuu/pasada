# Dev log

One line per surprise: where the real SDK, Velo dashboard or Testnet behaved differently from the
docs, and what we changed. Newest first.

- 2026-11-07 09:10 — `NoirAgentClient.getEvents` returned no events for a window holding our own transactions, while a raw RPC `getEvents` on `payment_escrow` returned 12: the SDK's decoder drops them, so the site's Noir event rows stay empty. Payments don't depend on it (the agent nudges the station directly and a sweeper runs every 20 s), so we left the SDK alone.
- 2026-11-07 00:10 — Velo webhook: the dashboard sends a flat body (`{ id, type, paymentIntentId, projectId, test }`) but `Velo.webhooks.verify` in 0.1.0-alpha.4 also requires `version`, `sentAt`, `project{…}` and `paymentIntent{…}`, so every delivery failed with 400 after the signature had already matched. `routes/veloWebhook.ts` still verifies through the SDK; on the SDK's post-HMAC shape error it reads the intent id itself and confirms amount and status with `paymentIntents.retrieve` before funding.
- 2026-11-06 23:20 — Velo: a new project needed two dashboard steps before checkouts worked (`Register Project On-Chain`, then `Activate Velo Pay`); before that the API returned 401 "Payment access not activated". A 1 XLM test checkout now returns status `created` and `receiverAddress` = the program owner (GBHC…IYZG), as planned in §12.1. Check: `npx tsx apps/server/scripts/velo-check.ts`.
- 2026-11-06 21:35 — Built in a workspace that can't reach Stellar or Velo. Everything is verified against `FakeChain`/`FakeVelo` (`npm run dev:fake`, `npm test`); the first real Testnet run is `npm run keys && npm run setup:chain && npm run smoke` on a laptop.
- 2026-11-06 21:30 — `@carts1024/velo-sdk@1.0.0` was published 2026-11-05 with the same API we use; we stay on `0.1.0-alpha.4` because the handbook says to use the alpha tag.
- 2026-11-06 21:25 — `NoirAgentClient.checkPayment` returns `expired` as a fallback reason when the contract refuses for a reason it can't see; we map `expired` to `PROGRAM_EXPIRED`.
- 2026-11-06 21:20 — Root `vite` (pulled in by vitest) and `apps/web` `vite` differ, so `vite.config.ts` is left out of the web `tsc` check; `vite build` still type-checks nothing and builds fine.
