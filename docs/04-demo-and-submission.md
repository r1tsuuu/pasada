# 04 — Demo, pitch and submission: Pasada

## 1. Before recording or pitching

1. Open `https://<render>/api/health` (wakes the server).
2. `POST /api/admin/reset` (clears the local log) and run `npm run setup:chain -- --reset-j3` (J3 back to 3 XLM).
3. Treasurer wallet (Noir extension) unlocked, with Testnet XLM.
4. Browser: the live site at 1440 px wide, zoom 110%, one Stellar Expert tab ready.
5. Phone hotspot, not venue Wi-Fi. The backup video is on the laptop desktop.

## 2. Two-minute demo video (required for submission)

Record the live site with a voiceover. Natural, spoken, no reading off slides.

| Time | Screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Site header, three panels | "This is Pasada. The government keeps giving jeepney drivers fuel aid, and it keeps leaking: stations wait weeks to get paid, cash gets spent on other things, and drivers queue to claim it. Pasada gives every jeepney an AI agent that spends its fuel aid only on fuel." |
| 0:15–0:40 | S1: J1 at Bituin Fuels, 40 L, tap | "The driver taps the jeepney's card. The agent checks the rules: accredited station, weekly allowance, tank size. Then it asks Noir's contract whether the payment fits the policy, and pays the station from the jeepney's escrow. Here's the transaction on Stellar Testnet. A few seconds later the station's own agent claims it." (click both links) |
| 0:40–0:55 | S2: J2, 80 L | "Someone asks for 80 liters on a 50-liter tank. The agent pays for 50 and says why." |
| 0:55–1:10 | S3 and S4 quickly | "Another full fill twelve minutes later gets held for review. A station that isn't accredited gets refused before any money moves." |
| 1:10–1:45 | S5: J3, 40 L → held → top-up → Velo checkout → pay → funded → released | "This jeepney is running low. The agent holds the fill, works out how much it needs from its own usage, and requests a top-up from the program through a Velo checkout. The treasurer pays. Velo confirms the payment on the ledger and sends us a signed webhook, we fund the escrow on Noir, and the held fill goes through on its own." |
| 1:45–2:00 | Dashboard + event feed | "Every peso has a reason and a transaction behind it. Noir sets the limits, Velo moves and proves the money, and the agent makes the calls in between. That's Pasada: fuel aid that only buys fuel." |

## 3. Five-minute live pitch (top 10 only, Sunday 1:00 PM) + 3 minutes Q&A

| Time | Beat |
| --- | --- |
| 0:00–0:45 | Problem: the 2026 subsidy (₱10 → ₱12 per liter, 150 L/week, stations stopped honoring it over late reimbursement, ₱651M paid as cash). Three failures: speed, purpose, access. |
| 0:45–1:15 | Insight: rules are checked after the money moves. Pasada checks them at the pump. |
| 1:15–1:45 | How it works: program → card escrow (Noir) → vehicle agent decides, pays, requests → station agent claims → Velo top-ups. |
| 1:45–4:00 | **Live demo:** S1, S2, S5 (skip S3/S4 if short on time). Click one tx link. |
| 4:00–4:40 | Why it matters beyond the hackathon: first users are cooperatives and LGUs running their own fuel aid (Manila already does e-fuel cards); the House is moving to make the subsidy permanent. Same engine works for private fleets. |
| 4:40–5:00 | Close: "Bawat litro, may patunay. Every liter, proven." |

**Q&A answers to rehearse**

| Question | Answer |
| --- | --- |
| Isn't this just rules? | The hard limits are on-chain, in Noir's policy. The agent decides everything in between: whether a fill makes sense for this jeepney right now, when to hold, and how much money to ask for and why. It also pays without a human pressing pay. |
| Will the government use crypto? | Stellar is plumbing. Programs fund in pesos and stations get pesos; on Testnet XLM stands in for a peso stablecoin. The first buyers are cooperatives and LGUs, not the national program on day one. |
| How do you know the fuel went in the tank? | We know an enrolled card paid an accredited pump, within the tank's size, at a sensible interval. That's not tamper-proof, but it's far tighter than cash or an ATM card, and every exception is flagged. |
| What if someone clones the card? | The card holds no secret. A cloned card can only buy fuel at accredited stations, within the tank size and weekly cap, and the program can revoke it and sweep the escrow back in one step. |
| Why Noir and Velo? | Noir gives each card a wallet with on-chain spending limits and an escrow the program controls. Velo gives us a checkout the treasurer can pay and a ledger-verified, signed confirmation we can trust before we move money. |

## 4. Submission checklist (form: https://forms.gle/hQ73PnsR1w2YwAq57 — submit by 11:00 AM)

- [ ] Public GitHub monorepo link; root README in the handbook's format
- [ ] 2-minute demo video link (YouTube unlisted or Google Drive, "anyone with the link")
- [ ] Pitch deck link (export the deck to PDF, upload to Google Drive, "anyone with the link can view")
- [ ] Short write-up (below)
- [ ] Live website link (Vercel URL), checked in an incognito window
- [ ] Team members: names and Discord handles, all registered in the Google Form
- [ ] Testnet proof: Stellar Expert links for an `authorize`, a `claim`, and a `fundEscrow`

## 5. Write-up (paste into the form, edit names)

**Pasada: fuel aid that only buys fuel.** The government keeps funding fuel aid for jeepney drivers, and
every channel it has tried breaks: stations front the discount and wait for reimbursement, cash cards get
spent on other things, and payout events make drivers queue. Pasada gives each jeepney's card a Noir escrow
run by its own AI agent.

**How the agent works.** When the driver taps the card at a pump, the vehicle agent decides whether to pay:
the station must be accredited, the fill must fit the tank and the 150-liter weekly allowance, and a second
full tank within an hour gets held for review. It then calls Noir's `checkPayment` and `authorizePayment` to
pay the station from the escrow, and a station agent claims the payment automatically. When the escrow runs
low, the vehicle agent works out how much it needs from its own usage and requests a top-up from the program
through a Velo checkout session.

**Payment flow.** The program registers each card on Noir's `device_registry`, sets the agent's per-fill cap
and expiry on `agent_registry`, and funds `payment_escrow`. The agent pays through `payment_escrow`; the
station claims. Top-ups go through Velo: checkout session → the treasurer pays → Velo verifies the payment on
the ledger and sends a signed `payment.succeeded` webhook (with a status poller as backup) → our server funds
the escrow on Noir and releases any fill that was waiting. Everything runs on Stellar Testnet, and every
decision on the site links to its transaction.
