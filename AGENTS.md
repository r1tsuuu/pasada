# AGENTS.md — instructions for AI coding agents working on Pasada

You are building **Pasada**, a hackathon entry for the Velo x Noir Agentic Payment Hackathon.
Submission deadline: **Saturday, Nov 7, 2026, 12:00 PM Philippine time (UTC+8)**. Target: deployed and
working by **Saturday 3:00 AM**, docs and video by 11:00 AM.

## Read these first, in this order

1. `docs/01-product-context.md` — what we are building and why, the demo world, the scenarios.
2. `docs/02-technical-design.md` — architecture, data model, rules, API, deployment. **This is the spec.**
3. `docs/03-implementation-plan.md` — the ordered task list. Work one task at a time.
4. `docs/05-sdk-reference.md` — exact SDK signatures, verified from the published type definitions.
   Do not guess SDK method names. If it is not in that file, check `node_modules/<pkg>/dist/*.d.ts`.
5. `docs/04-demo-and-submission.md` — only needed at the end.

When the spec and your intuition disagree, follow the spec. When the spec and the real SDK
disagree, follow the SDK, make the smallest change that works, and write one line in `docs/DEVLOG.md`.

## Non-negotiable rules (breaking any of these disqualifies the project)

1. **Noir only through `@noirx402/agent-sdk@0.3.0`, on the deployed Testnet contracts.**
   Create the client as `new NoirAgentClient()` with **no `network` override**. Its built-in `TESTNET`
   IDs are the required ones: `device_registry` `CAC4KOLHDLDYDWBOKXNKRN5KVHO56PLOIFXDLTBUWGVN6GVDEB7FQHU5`,
   `agent_registry` `CCMZDSPTLX7IIJWCYEUM5DJUHOSOYSTHGK777S2TXZWEMC5ZZGPJ3EBV`,
   `payment_escrow` `CC7EAW5FNJEDBS7THM5IT6XIOHO4AOYMLXT3KSZ3HWUIKEACTW7E5BFS`.
   The older `CB4D…`/`CBTD…`/`CA5S…` IDs are retired. Never call Noir contracts with raw
   `@stellar/stellar-sdk` invocations. Never deploy contracts.
2. **Velo through `@carts1024/velo-sdk@0.1.0-alpha.4`**, server-side only, for checkout sessions,
   payment status and signed webhooks.
3. **Stellar Testnet only.** No real funds anywhere.
4. **Secrets live only in `apps/server/.env`** (git-ignored) and in the host's env settings.
   Nothing secret in `apps/web`, in code, in logs, or in commits. Every variable is listed, empty, in
   `.env.example` files.
5. **Monorepo layout is fixed** (see technical design §3). One root `npm install` installs everything.
6. **The website must be live** at a public URL and work against the deployed server.
7. **An AI agent decides, requests and makes the payments.** A human never presses "Pay" on a fuel
   purchase. The driver only taps the jeepney's card; the vehicle agent decides and pays.

## Stack (pinned)

| Thing | Choice |
| --- | --- |
| Node | 24.x, at least 24.22.1 (22.23.4+ also works). Put `"engines": {"node": ">=22.23.4"}` in the root `package.json` |
| Package manager | npm workspaces (no pnpm, no yarn, no Turborepo) |
| Language | TypeScript 5.9, `strict: true`, ESM only (`"type": "module"` in every package.json) |
| Runtime for server and scripts | `tsx` (no compile step for the server or packages) |
| Server | Express 4 (`express@^4.21.2`), `cors`, `dotenv` |
| Web | Vite 6 + React 18 + TypeScript + Tailwind CSS v4 via `@tailwindcss/vite` |
| Tests | Vitest 3 |
| Stellar | `@stellar/stellar-sdk@^16.0.1` (peer of the Noir SDK) |
| Noir | `@noirx402/agent-sdk@0.3.0` (exact) |
| Velo | `@carts1024/velo-sdk@0.1.0-alpha.4` (exact) |

## Commands (must work from the repo root)

```bash
npm install            # installs every workspace
npm run keys           # generates any missing Testnet keypairs, funds them with Friendbot, writes apps/server/.env
npm run setup:chain    # registers the demo jeepneys on Noir and funds their escrows (idempotent)
npm run smoke          # one checkPayment + authorizePayment + claim on Testnet; prints Stellar Expert links
npm run dev            # server on :8080 and web on :5173
npm test               # unit tests (rule engine, tranche planner, vehicle agent with a fake chain)
npm run typecheck      # tsc --noEmit in every workspace
npm run build          # builds apps/web to apps/web/dist
npm start              # starts the server (production)
```

## Coding conventions

- **Money is `bigint` stroops** (1 XLM = 10,000,000). Convert with `toStroops` / `fromStroops` from the
  Noir SDK. Never use floating point for money. Over HTTP, send stroops as decimal strings in fields
  named `…Stroops`, plus display strings (`xlm`, `php`) computed on the server.
- **Liters are whole numbers** (integers 1–200).
- **Every chain write goes through `packages/agent/src/noirChain.ts`** and is wrapped in the per-account
  lock (`withAccountLock`). Two transactions from the same account at once will fail with a bad sequence.
- **The rule engine is pure** (`packages/agent/src/rules.ts`, `tranche.ts`): no I/O, `now` passed in.
  Write its tests first, from the table in technical design §8.
- Catch `NoirContractError` and turn it into a decision with reason `CHAIN_ERROR` and the contract's
  `errorName`. The server must never crash on a failed transaction.
- One JSON log line per decision, per tranche change and per claim. Never log secrets.
- Do not add features that are not in the implementation plan. P2 items only after every P0 and P1
  item is deployed and working.
- Keep files small and named as in the technical design, because the README links to exact files
  and line numbers and the judges check them.

## Definition of done (the whole project)

- [ ] `npm install && npm run typecheck && npm test` pass from a clean clone.
- [ ] Scenarios S1–S5 in `docs/01-product-context.md` work on the **deployed** site, end to end on Testnet.
- [ ] The README follows the handbook template, and every file/line link in it points at real code.
- [ ] At least three real Stellar Expert transaction links in the README (an `authorize`, a `claim`,
      a `fundEscrow` that followed a Velo payment).
- [ ] No secret in the git history (`git log -p | grep -E "S[A-Z2-7]{55}"` finds nothing).
