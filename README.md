# Pasada

Fuel aid that only buys fuel: each jeepney's card gets a Noir escrow run by its own AI agent, which decides every fill, pays the station on the spot, and asks the program for a top-up through Velo when it runs low. Built for programs that give fuel aid to public utility vehicle (PUV) drivers.

**Live website:** https://TODO.vercel.app
**Demo video (2 min):** https://TODO
**Pitch deck:** https://TODO
**Team:** TODO Name (Discord `TODO`), TODO Name (Discord `TODO`)

## Problem

The Philippine government keeps funding fuel aid for jeepney drivers, most recently a ₱10–₱12 per-liter discount in 2026 capped at 150 liters per vehicle a week, and every delivery channel breaks. Stations front the discount and wait for reimbursement, and some stopped honoring it; cash and ATM cards get spent on things other than fuel; and payout events make drivers queue and lose trips. The rules are only checked after the money has moved. ([sources](docs/01-product-context.md#1-the-problem-why-this-is-real-not-a-one-off))

## Solution

Pasada puts the rules inside the money. The program registers each jeepney's NFC card on Noir, gives the jeepney's agent a constrained key (a per-fill cap and an expiry), and funds its escrow. At the pump, the driver only taps the card. The vehicle agent decides whether and how much to pay, pays the station through Noir's escrow, and a station agent claims the payment. When the escrow runs low, the agent sizes a top-up from its own usage and requests it from the program through a Velo checkout; Velo's signed confirmation triggers the escrow refill.

## How the agentic payment works

1. **Driver taps** the jeepney's card at a pump and enters the liters (`POST /api/fills`).
2. **The vehicle agent decides** (pure rules in [`rules.ts`](packages/agent/src/rules.ts)): the station must be accredited; the fill is capped at the tank size and the remaining 150 L weekly allowance; a second fill within an hour that would overfill the tank is **held** for program review.
3. **It checks Noir** with `checkPayment` (the contract's own `check_payment` plus the escrow balance).
4. **It pays** with `authorizePayment` from the jeepney's escrow to the station (whom), for the capped amount (how much), now or later (when).
5. **The station agent claims**: it watches `payment.authorized` events and calls `claim`.
6. **When funds run short, the agent requests money**: it holds the fill, works out the top-up (two days of its own usage plus the held fill, minus the balance), and creates a **Velo checkout session** for the program treasurer.
7. **Velo confirms** the payment on the ledger and sends a signed `payment.succeeded` webhook (a status poller is the backup). The server calls Noir `fundEscrow`, and the held fill is paid automatically.

## Architecture

```mermaid
flowchart LR
  Web[apps/web: pump, decisions, program dashboard] -->|REST| API[apps/server: Express API]
  API --> VA[Vehicle agent]
  VA --> Rules[packages/agent: rules + top-up planner]
  VA -->|checkPayment, authorizePayment| Noir[(Noir Testnet contracts)]
  SA[Station agent] -->|watch, claim| Noir
  VA -->|top-up needed| VeloSvc[Velo service]
  VeloSvc -->|checkout.sessions.create| Velo[(Velo)]
  Treasurer([Treasurer wallet]) -->|pays checkout| Velo
  Velo -->|signed payment.succeeded| VeloSvc
  VeloSvc -->|fundEscrow| Noir
```

## Noir integration

- **SDK:** `@noirx402/agent-sdk@0.3.0`, default `TESTNET` contracts (no override).
- **Contracts called:** `device_registry` (`CAC4…QHU5`), `agent_registry` (`CCMZ…EBV`), `payment_escrow` (`CC7E…BFS`).
- **Methods used** (TODO: replace with permalinks to the final commit, with line numbers):

| Method | Where | Why |
| --- | --- | --- |
| `execute({ kind: 'registerDevice' })` | [`noirChain.ts#L?`](packages/agent/src/noirChain.ts) | Link each jeepney card to the program wallet and its agent |
| `execute({ kind: 'registerAgent' })` | [`noirChain.ts#L?`](packages/agent/src/noirChain.ts) | Per-fill cap = tank × subsidy rate; expiry = program end |
| `execute({ kind: 'fundEscrow' })` | [`noirChain.ts#L?`](packages/agent/src/noirChain.ts) | Initial funding and every Velo-confirmed top-up |
| `checkPayment` | [`noirChain.ts#L?`](packages/agent/src/noirChain.ts) | The agent's pre-payment check |
| `authorizePayment` | [`noirChain.ts#L?`](packages/agent/src/noirChain.ts) | The agent pays the station |
| `claim`, `getPendingBalance`, `watch` | [`stationAgent.ts#L?`](packages/agent/src/stationAgent.ts) | Station agent collects payments |
| `getEscrowBalance`, `getPolicy` | [`noirChain.ts#L?`](packages/agent/src/noirChain.ts) | Low-balance detection and the dashboard |

## Velo integration

- **SDK:** `@carts1024/velo-sdk@0.1.0-alpha.4`.
- **What Velo does:** the vehicle agent's top-up requests (checkout sessions), payment status (`paymentIntents.retrieve` poller), and signed `payment.succeeded` webhooks that trigger the Noir escrow refill.
- **Files** (TODO: permalinks): [`velo/client.ts`](apps/server/src/velo/client.ts), [`velo/topups.ts`](apps/server/src/velo/topups.ts), [`velo/poller.ts`](apps/server/src/velo/poller.ts), [`routes/veloWebhook.ts`](apps/server/src/routes/veloWebhook.ts).

## Testnet proof

TODO: paste from [`docs/testnet-proof.md`](docs/testnet-proof.md).

- Agent payment (`authorize`): https://stellar.expert/explorer/testnet/tx/TODO
- Station claim: https://stellar.expert/explorer/testnet/tx/TODO
- Escrow top-up after a Velo payment (`fundEscrow`): https://stellar.expert/explorer/testnet/tx/TODO

## Repo structure

```
apps/web/          the live website (Vite + React)
apps/server/       API, Velo checkout/webhook/poller, agent runtime, setup scripts
packages/agent/    vehicle agent, station agent, rules, top-up planner, every Noir SDK call
packages/shared/   types, demo program config, money formatting
docs/              design docs, testnet proof, screenshots
```

## Run it locally

1. Prerequisites: Node ≥ 22.23.4 (or ≥ 24.22.1); a Velo Testnet API key and webhook secret from velo-build.dev; a Testnet wallet (e.g. the Noir Chrome extension) to act as the treasurer.
2. `npm install` at the root.
3. `cp apps/server/.env.example apps/server/.env` and `cp apps/web/.env.example apps/web/.env`; fill `VELO_API_KEY`, `VELO_WEBHOOK_SECRET`, `ADMIN_TOKEN`; then `npm run keys` (creates and funds the Testnet accounts) and `npm run setup:chain` (registers the demo jeepneys on Noir).
4. `npm run dev` → open http://localhost:5173.

## Environment variables

| Name | What it is | Where to get it |
| --- | --- | --- |
| `PROGRAM_OWNER_SECRET` | Program wallet that owns the cards and funds escrows | `npm run keys` |
| `AGENT_J1_SECRET`, `AGENT_J2_SECRET`, `AGENT_J3_SECRET` | Vehicle agent keys | `npm run keys` |
| `STATION_S1_SECRET`, `STATION_S2_SECRET` | Accredited station keys | `npm run keys` |
| `STATION_S3_PUBLIC` | Unaccredited station address | `npm run keys` |
| `VELO_API_KEY` | Velo Testnet API key | velo-build.dev |
| `VELO_WEBHOOK_SECRET` | Velo webhook signing secret | velo-build.dev → webhooks |
| `WEB_ORIGIN` | Allowed CORS origins | your web URL(s) |
| `PUBLIC_WEB_URL` | Where Velo checkout returns | your web URL |
| `ADMIN_TOKEN` | Protects admin routes | any random string |
| `VITE_API_URL` (web) | Server URL | your server URL |

## Screenshots

TODO: `docs/screenshots/pump.png`, `decisions.png`, `topup.png`.

## What's next

- Real NFC readers at the pump (the card already works by UID hash).
- A peso stablecoin instead of Testnet XLM, and same-day peso payout to stations.
- Pilot with a transport cooperative or LGU running its own fuel aid; then national programs.
- Fee sponsorship so drivers and stations never hold XLM.
- The same engine for private fleets (fuel, tolls and repairs per trip).

## Credits

- [Noir](https://github.com/noirx402/noir) and `@noirx402/agent-sdk` (contracts, SDK, Chrome extension).
- [Velo](https://github.com/Velo-Ecosystem-Collection/Velo) and `@carts1024/velo-sdk`.
- `@stellar/stellar-sdk`, Express, React, Vite, Tailwind CSS, Vitest.
- Problem research: news sources listed in [`docs/01-product-context.md`](docs/01-product-context.md).
