# Pasada: 90-second demo plan

For hackathon judges. Problem, then the core flow end to end, then the result.
The scripted recording runs in **demo mode** (`npm run demo`): real Noir transactions on Stellar Testnet, signed on the server with throwaway test keys.
Velo is the exception: a labelled demo checkout stands in for it, and its payment is a plain Testnet transfer. To show the real Velo checkout, record the live site by hand using the "Fix before recording" list.
Offline mode is for rehearsal only: its header badge says "Offline simulation" and its tx links are fake.

## Fix before recording (live-site recording only; `npm run demo` needs none of this)

1. **Reset the live escrows. Without this the main scene will not happen.**
   Live balances on 2026-11-07 are J1 8 XLM, J2 7 XLM, J3 12 XLM. The demo needs J1 12 and J3 3.
   - With J3 at 12 XLM, the 40 L fill is simply approved, so there is no hold and no top-up request.
   - With J1 at 8 XLM, scene 2 drops it to 4 XLM, under its 6 XLM threshold, which should raise an unplanned J1 top-up.
   - Fix: `npm run setup:chain -- --reset-j3` (sets J1 and J2 to 12 XLM, J3 to 3 XLM).
2. **Get the real `apps/server/.env`.** This machine has none, and the reset needs it.
   Copy the values from Render or a teammate. **Do not run `npm run keys` to fill it**: that creates new wallets
   that don't own the registered cards, and `setup:chain` will stop with "Card already registered".
   The program wallet must be `GBHC…IYZG`.
3. **Treasurer wallet.** Unlock the Noir Chrome extension with at least 13 XLM plus fees (the earlier payer was `GDPN…CSVQ`).
   The Playwright headless browser can't load the extension, so record scene 7 by hand in real Chrome, or in headed Chromium with the extension loaded.
4. **Walk the Velo checkout once.** Scene 7's steps inside the Velo page are unconfirmed: it was not opened while writing this plan.
5. **Get `ADMIN_TOKEN`.** Needed only for retakes. The live log is already empty.

Each full take spends the setup, so a retake needs:

```bash
curl -X POST https://pasada-server.onrender.com/api/admin/reset -H "x-admin-token: $ADMIN_TOKEN"
npm run setup:chain -- --reset-j3
```

Don't push to `main` while recording: a Render redeploy clears the decision log.

## Run it locally

**Offline (no keys, no network). Checked on this machine with Node 23.6.1:**

```bash
npm install
npm run dev:fake     # server on :8080, web on http://localhost:5173
```

The check ran the same server and Vite commands directly, with data in a temp folder.
All of S1–S5 gave the expected results, including the 13 XLM top-up. The test checkout is a local page with a "Pay with test wallet" button.

**Real Testnet (not run here, because there is no `.env`):**

```bash
npm install
cp apps/web/.env.example apps/web/.env
# put the real apps/server/.env in place (see item 2 above)
npm run dev
```

Velo webhooks can't reach localhost, so a local run confirms through the 5-second status poller.

## Recording setup

- Viewport 1440×900 at 100% zoom. All three panels fit; the docs' 110% zoom was not tested.
- Load the page and leave it open for a minute first. The free Render server sleeps when idle.
- The page loads with Bituin Fuels, NVE 1234 and 40 L already selected.
- Times below are the **final edit**. Testnet is slower than the scenes: past setup transactions landed 10–18 s apart, and a live fill has not been timed.
  Record in real time, trim the waits, and show a small "waits trimmed" caption in scenes 2, 4 and 8.

## Scenes

Narration is sized for about 2.5 words per second.

### Problem

**Scene 1 · 0:00–0:07 (7 s)**
- On screen: The app at the top of the page. Header shows the "Demo mode · Stellar Testnet" badge; Agent decisions lists three rows tagged "Sample". No clicks.
- Narration: "Jeepney fuel aid keeps leaking: stations get paid late, cash gets spent elsewhere, drivers queue to claim it."

### Core flow

**Scene 2 · 0:07–0:19 (12 s): the driver taps**
- On screen:
  1. Hover Bituin Fuels — EDSA Cubao.
  2. Hover the NVE 1234 card.
  3. Type **40** into Liters.
  4. Click **Tap jeepney card**.
  5. Scroll down a little and hold on "Agent is deciding…" and the steps: Reading the card, Agent checking the rules, Noir: checkPayment, Noir: authorizePayment.
- Narration: "The driver taps the jeepney's card, and that's all they do. From here, the jeepney's own AI agent decides whether to pay."

**Scene 3 · 0:19–0:31 (12 s): the agent decides and pays**
- On screen:
  1. A green **Paid** card lands at the top of Agent decisions: "Asked 40 L · paid for 40 L", ₱480 (4 XLM).
  2. Click **Rules checked (9)** on that card and hold on the list.
- Narration: "It checked the station, the tank and the weekly allowance, confirmed the payment with Noir's contract, then paid the station 480 pesos from the escrow."

**Scene 4 · 0:31–0:41 (10 s): real money movement, station paid**
- On screen:
  1. Click **Payment tx** on the card. Stellar Expert opens in a new tab; hold 4 s.
  2. Return to the site. "Station agent claiming…" has become **Station claim tx**.
- Narration: "This is a real Stellar Testnet transaction. Seconds later, the station's own agent claims it, with no reimbursement wait."

**Scene 5 · 0:41–0:49 (8 s): the agent refuses**
- On screen:
  1. Click **Kanto Fuel Depot** (red "Not accredited" tag).
  2. Click the **TXR 5678** card.
  3. Type **20** into Liters.
  4. Click **Tap jeepney card**.
  5. A red **Refused** card appears: "Kanto Fuel Depot is not an accredited station. No payment made."
- Narration: "At a station that isn't accredited, the agent refuses before any money moves."

**Scene 6 · 0:49–1:02 (13 s): the agent asks for money**
- On screen:
  1. Click **Bituin Fuels** and the **PUJ 9012** card (₱360 balance), then type **40** into Liters.
  2. Click **Tap jeepney card**.
  3. A blue **Held** card appears: "The fuel-aid balance is ₱360 and this fill needs ₱480…"
  4. Scroll down to **Top-up requests** and hold on ₱1,560 (13 XLM) and the agent's quoted reasoning.
- Narration: "This jeepney is running low, so the agent holds the fill, sizes a top-up from its own usage, and requests 1,560 pesos from the program."

**Scene 7 · 1:02–1:12 (10 s): the treasurer pays the request**
- On screen:
  1. Click **Open demo checkout**.
  2. The labelled demo checkout page shows 13 XLM.
  3. Click **Pay as treasurer**. The server signs a real Testnet payment; no wallet popup.
  4. The site returns to the dashboard at Top-up requests.
- Narration: "The program treasurer pays the request. In this recording, a demo checkout stands in for Velo, signed with a test key."

**Scene 8 · 1:12–1:24 (12 s): the money arrives, the fill pays itself**
- On screen:
  1. Hold on the top-up badge as it changes to **Funded**, with "Confirmed by demo checkout" and **Escrow funded tx**.
  2. Scroll to the top. PUJ 9012's escrow is now ₱1,440 after the ₱480 fill.
  3. Hold on the new green **Paid** card: "Funds arrived. Approved 40 L…"
- Narration: "The payment confirms, the escrow refills on Noir, and the held fill pays itself, with nobody pressing pay."

### Result

**Scene 9 · 1:24–1:30 (6 s)**
- On screen: Hold on PUJ 9012's **Paid** card. Point at **Payment tx**, then **Station claim tx**.
- Narration: "Every peso has a reason and a transaction. Pasada: fuel aid that only buys fuel."

## Video edit

`out/demo.mp4` adds these around the recorded scenes (narration for the cards is in `scripts/demo-lib.ts`):

- Scene 1 plays as an animated problem card instead of the idle dashboard.
- A "how it works" card follows it, and a results card from the recorded run follows scene 9.
- Stamps mark the key moments: PAID, STATION PAID, REFUSED, HELD, ESCROW FUNDED.

## What was left out

- **S2 (overfill) and S3 (too soon):** cut for time. Scene 5 shows the agent choosing *whom*, and scene 6 shows *when* and *how much*.
- **The submission video:** `docs/04-demo-and-submission.md` asks for a 2-minute video. To extend this cut, add S2 after scene 5 (about 15 s) and S3 after that (about 15 s).
