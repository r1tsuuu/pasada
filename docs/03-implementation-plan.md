# 03 — Implementation plan: Pasada

Work top to bottom. Each task lists its priority, a time box (Philippine time, Friday night to Saturday),
the files it touches, the steps, and **acceptance criteria that must pass before the next task starts**.
If a task overruns its time box by more than 50%, stop and apply the cut listed under "If stuck".

Priorities: **P0** = required for submission. **P1** = makes the demo strong; do after all P0 tasks are
deployed. **P2** = only if everything else is done and deployed.

Two people can work in parallel: **Eng** (server, agent, chain, Velo) and **Design/Web** (the website,
against mock data until T7 lands). Hard deadline: submission form sent by **Saturday 11:00 AM**.

---

## Phase 0 — Accounts and scaffold (21:30–22:30)

### T0 · P0 · Human setup (Eng, 20 min, no code)
1. Confirm `node -v` is ≥ 22.23.4 (or ≥ 24.22.1).
2. Install the Noir Chrome extension; create a wallet; fund it with Friendbot. This is the **treasurer** wallet.
3. Create the public GitHub repo `pasada` (empty).
4. Create a Render account and a Vercel account, both linked to GitHub.
5. Velo dashboard is done in T3, after `npm run keys` creates the program owner key.

**Accept:** Node version OK; extension wallet funded; empty repo exists.

### T1 · P0 · Monorepo scaffold (Eng, 30 min)
Files: root `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `.env.example`,
every workspace `package.json` and `tsconfig.json`, `apps/server/src/index.ts` (prints "ok"),
`apps/web` from `npm create vite@latest` (react-ts) moved into place, Tailwind v4 via `@tailwindcss/vite`.
Follow technical design §3 exactly (names, scripts, `"type": "module"`, `exports` → `./src/index.ts`).

**Accept:** from a clean clone, `npm install` succeeds; `npm run typecheck` passes; `npm run dev` starts both
apps; `http://localhost:5173` shows the Vite page; `node -e "import('@noirx402/agent-sdk').then(m=>console.log(Object.keys(m)))"`
run inside `apps/server` lists `NoirAgentClient`; same for `@carts1024/velo-sdk` listing `Velo`.

---

## Phase 1 — Prove the chain works first (22:30–23:30)

### T2 · P0 · Shared config, keys script (Eng, 25 min)
Files: `packages/shared/src/{types,config,money,index}.ts`, `packages/agent/src/{deviceHash,lock}.ts`,
`apps/server/src/env.ts`, `apps/server/scripts/generate-keys.ts`.
Implement §4, §5, §6, §9.1 of the technical design. `money.ts`: `phpFromStroops(stroops)` → `"₱1,440"`
using the demo rate, `xlmFromStroops(stroops)` → `"12 XLM"` (via `fromStroops`, trimming trailing zeros).

**Accept:** `npm run keys` creates `apps/server/.env` with 7 secrets/addresses filled, prints 7 public keys
with Stellar Expert links, and every funded account shows ~10,000 XLM on Stellar Expert. Running it again
changes nothing. `deviceHash('04A1B2C3D4E501')` equals `printf '%s' 04A1B2C3D4E501 | sha256sum`.

### T3 · P0 · Velo dashboard (Eng, 15 min, no code)
Follow technical design §12.1 steps 1–3 now (import the program owner secret into a wallet, sign in to
velo-build.dev, create the project, make a Testnet API key). Put `VELO_API_KEY` in `apps/server/.env`.
The webhook URL comes later (T13), because it needs the deployed server.

**Accept:** a one-off script or REPL call to `velo.checkout.sessions.create({ amount: '1', asset: 'native', description: 'test' })`
returns a `checkoutUrl`; log `receiverAddress` and compare it with the program owner's public key; write
the result in `docs/DEVLOG.md`.

### T4 · P0 · Noir chain adapter + setup + smoke (Eng, 35 min)
Files: `packages/agent/src/{chainPort,noirChain}.ts`, `apps/server/scripts/{setup-chain,smoke}.ts`.
Implement technical design §13, §13.1, §13.2.

**Accept:** `npm run setup:chain` registers J1–J3, sets their policies and funds the escrows (12, 12, 3 XLM);
running it twice makes no new transactions. `npm run smoke` prints an `authorize` tx link and a `claim` tx
link that open on Stellar Expert. **Copy both links into `docs/testnet-proof.md`. This is the most important
checkpoint of the night.**

**If stuck (> 50 min):** post the exact error in Discord `#noir-sdk-and-extension`; meanwhile continue
with T5 (pure code) and come back.

---

## Phase 2 — The agents (23:30–01:30)

### T5 · P0 · Rule engine and top-up planner, tests first (Eng, 40 min)
Files: `packages/agent/src/{rules,tranche,explain}.ts`, `packages/agent/test/{rules,tranche}.test.ts`.
Write every test in technical design §8.3 and §9.3 first; then implement until they pass.

**Accept:** `npm test` passes all 13 rule tests and the 3 planner tests.

### T6 · P0 · Vehicle agent + station agent (Eng, 40 min)
Files: `packages/agent/src/{vehicleAgent,stationAgent,index}.ts`, `packages/agent/test/vehicleAgent.test.ts`.
Implement §8.1, §8.5 (release after funding only; program approve/reject is P1 in T11), §10.
The vehicle agent receives its dependencies (chain, store functions, `ensureTopUp` callback, clock) as
constructor arguments so the test can pass a `FakeChain`.

**Accept:** `vehicleAgent.test.ts` covers: approved path (calls checkPayment then authorizePayment, records tx
hash); capped path; refused path makes no chain call; `insufficient_escrow` creates an `AWAITING_FUNDS` held
fill and calls `ensureTopUp` once; `NoirContractError` gives `FAILED` with its `errorName`.

### T7 · P0 · Server API + store (Eng, 40 min)
Files: `apps/server/src/{index,app,store,serialize}.ts`, `routes/{state,fills}.ts`.
Implement §7 and §11 (except the webhook and P1/P2 routes). On boot: validate env, load store, create
`NoirAgentClient`, start the station agent's watch and sweeper, listen on `PORT`.
Until Velo is wired (T9), `ensureTopUp` is a stub that records a tranche with status `FAILED` and error
"Velo not wired yet".

**Accept (with curl, against Testnet):**
- `GET /api/health` returns the three **CAC4… / CCMZ… / CC7E…** contract IDs.
- `POST /api/fills {"vehicleId":"J1","stationId":"S1","liters":40}` → `APPROVED`, 40 L, with `authorizeTxHash`;
  within ~25 s `GET /api/state` shows `claimTxHash` on that decision (station agent worked).
- `{"vehicleId":"J2","stationId":"S2","liters":80}` → `APPROVED_CAPPED`, 50 L.
- `{"vehicleId":"J1","stationId":"S1","liters":30}` right after → `HELD`, `TOO_SOON`.
- `{"vehicleId":"J2","stationId":"S3","liters":20}` → `REFUSED`, `UNACCREDITED_STATION`, no tx.
Record the tx hashes in `docs/testnet-proof.md`.

---

## Phase 3 — Website (Design/Web, 22:00–02:00, in parallel)

### T8 · P0 · One-page site (Web, 3–4 h)
Files: everything under `apps/web/src` listed in technical design §3. Build from §14.
Until T7 is reachable, build against a local `mock-state.json` shaped exactly like the `GET /api/state`
example in §11. Switch to the real API by setting `VITE_API_URL`.

**Accept:** against the local server, scenarios S1–S4 can be run entirely from the page: the pump returns a
result card; the decision feed shows the rules checked with words (not only icons); tx links open on
Stellar Expert; the claim link appears without a page reload; balances and weekly liters update within
~5 s; the layout works at 390 px wide (stacked) and at 1440 px (three columns).

---

## Phase 4 — Velo top-ups (01:30–02:45)

### T9 · P0 · Top-up request + poller (Eng, 45 min)
Files: `apps/server/src/velo/{client,topups,poller}.ts`; replace the T7 stub.
Implement §9.2–§9.4 (poller path) and §8.5 "release after funding".

**Accept (local):** run `npm run setup:chain -- --reset-j3` so J3 holds 3 XLM. `POST /api/fills J3 S1 40` →
`HELD AWAITING_FUNDS`, a tranche `REQUESTED` for **13 XLM** with a rationale sentence and a `checkoutUrl`.
Open the checkout in the browser, pay with the treasurer wallet. Within ~10 s the tranche becomes `PAID`
(`confirmedVia: 'poll'`), then `FUNDED` with a `fundTxHash`; J3's escrow reads 16 XLM; the held fill is
released and a new decision `APPROVED` 40 L appears with an authorize tx; the station claims it.
Record the Velo payment, the `fundEscrow` tx and the release tx in `docs/testnet-proof.md`.

### T10 · P0 · Velo webhook route (Eng, 20 min)
Files: `apps/server/src/routes/veloWebhook.ts`. Implement §11.1. Mount it before `express.json()`.

**Accept:** a unit-level test or a local curl with a body signed with a test secret returns 400 for a bad
signature and 200 for a good one (use the SDK's verify for the real check). The end-to-end webhook check
happens after deploy in T13.

---

## Phase 5 — Deploy (02:45–03:45)

### T12 · P0 · Deploy server and web (Eng + Web, 40 min)
Follow technical design §16.

**Accept:** `https://<render>/api/health` returns the contract IDs; the Vercel site loads and shows live state
from the Render server (no CORS errors in the console).

### T13 · P0 · Webhook + full run on the live site (Eng, 20 min)
Set the Velo webhook URL to `https://<render>/webhooks/velo`, put the signing secret in Render as
`VELO_WEBHOOK_SECRET`, redeploy. Reset local state (`POST /api/admin/reset`) and J3 (`--reset-j3`, run
locally against the same Testnet accounts). Run S1–S5 on the **live** site.

**Accept:** all five scenarios pass on the live URL; at least one top-up shows `confirmedVia: 'webhook'`.
If the webhook still fails, the poller covers the demo; write the issue in `docs/DEVLOG.md` and move on.

**Freeze the code at 04:00.** After this, only README, video and deck work, plus P1 items if someone is fresh.

---

## Phase 6 — P1 improvements (only if Phase 5 is done)

### T11 · P1 · Program review of held fills (30 min)
`POST /api/held/:id/approve` and `/reject` (§8.5), and the Approve/Reject buttons in `HeldFills.tsx`.
**Accept:** S3's held fill can be approved from the dashboard and becomes a paid decision with
`RELEASED_BY_PROGRAM`.

### T14 · P1 · "Agent: check balance" button (15 min)
`POST /api/vehicles/:id/check-balance` and a button on each vehicle card. **Accept:** on a vehicle under the
threshold it creates a top-up; above the threshold it returns `null` and the UI says "Balance is fine".

### T15 · P2 · Extras (pick at most one)
- Program close: `POST /api/admin/vehicles/:id/close` using `unlinkDevice` (shows escrow swept back).
- Velo contract-event monitoring for the three Noir contracts (§12.1 step 6).
- Rate limit on `/api/fills`.

---

## Phase 7 — Submission (Saturday 08:00–11:00)

### T16 · P0 · README (Eng, 60 min)
Fill `README.md` (already in the handbook's template) with: live URL, video link, deck link, team with
Discord handles; real **file and line links** for every Noir and Velo call (use permalinks to the final
commit: `https://github.com/<you>/pasada/blob/<commit-sha>/packages/agent/src/noirChain.ts#L10-L25`);
the Testnet proof links from `docs/testnet-proof.md`; two or three screenshots in `docs/screenshots/`.

**Accept:** a teammate who did not write the code clones the repo, follows "Run it locally", and gets the
site running; every link in the README opens the right file and line.

### T17 · P0 · 2-minute demo video, deck, write-up, form (Design, 90 min)
Follow `docs/04-demo-and-submission.md`. Submit the form at https://forms.gle/hQ73PnsR1w2YwAq57 by **11:00 AM**.

---

## Cut list (apply in this order if behind schedule)

1. Drop all P2 items.
2. Drop T14 (check-balance button).
3. Drop T11 (program review); held `TOO_SOON` fills just stay held — the decision itself is the point.
4. Drop the Velo webhook (T10/T13 webhook part); rely on the poller and say so in the README.
5. Simplify the website to two columns (pump + decisions) with balances shown on the vehicle picker.

**Never cut:** T4 (real Testnet transactions), T5–T7 (the agent and its rules), T9 (the agent requesting
money through Velo), T12 (live URL), T16 (README).
