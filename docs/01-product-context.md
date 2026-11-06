# 01 — Product context: Pasada

**One line:** Pasada is fuel aid that only buys fuel. Each jeepney's card has a Noir escrow run by its own
AI agent, which decides every fill, pays the station on the spot, and asks the program for more money
when its route needs it.

## 1. The problem (why this is real, not a one-off)

The Philippine government keeps paying fuel aid to public utility vehicles (PUVs), and it keeps
rebuilding the delivery mechanism each time.

| When | What happened | Source |
| --- | --- | --- |
| 2018 | Pantawid Pasada Program starts: ₱5,000 each to 179,852 jeepney franchise holders | [PNA](https://alpha.pna.gov.ph/articles/1168098) |
| 2021–2024 | Repeated rounds: ₱1B in 2021 via Land Bank cards; ₱2.5B in the 2024 budget | [GMA](https://www.gmanetwork.com/news/topstories/nation/808484/ltfrb-p1-b-fund-for-fuel-subsidy-meant-for-puj-drivers-only/story/), [Inquirer](https://plus.inquirer.net/news/release-p-2-5-b-drivers-subsidy-dotr-urged/) |
| Mar 2026 | Middle East crisis. Over ₱651M paid out as cash through payout events; one payout disrupted jeepney operations and stranded commuters on Commonwealth | [Daily Tribune](https://tribune.net.ph/2026/03/30/p651m-in-fuel-subsidies-distributed), [DZRH](https://www.dzrh.com.ph/tag/fuel-subsidies) |
| Apr 2026 | ₱10-per-liter discount at the pump, **capped at 150 liters per week per vehicle**, for about 142,000 jeepney and UV Express units through 14,000 stations | [PTV](https://ptvnews.ph/ltfrb-oks-142k-jeepneys-uv-express-for-p10-l-fuel-subsidy-1/), [DZRH](https://www.dzrh.com.ph/post/jeepney-drivers-operators-undergo-orientation-for-peso10l-fuel-subsidy-in-metro-manila) |
| Apr 2026 | Manila's LGU gives its own fuel aid to Libreng Sakay drivers as prepaid e-fuel cards | [Manila Bulletin](https://mb.com.ph/2026/04/14/apart-from-p4000-payout-manila-to-distribute-p49-m-fuel-aid-to-jeepney-drivers) |
| May 2026 | Program expanded to all fuel retailers nationwide "with tighter oversight" | [Daily Tribune](https://tribune.net.ph/2026/05/19/fuel-subsidy-program-expands-nationwide-with-tighter-oversight-2) |
| Aug 2026 | Raised to ₱12 per liter; DOE says it runs through the end of 2026 | [Philstar](https://www.philstar.com/headlines/2026/08/05/2547199/fuel-discount-subsidy-transport-sector-raised-p12-liter), [Top Gear](https://www.topgear.com.ph/news/motoring-news/jeepney-uv-express-fuel-subsidy-end-of-year-a6941-20260818) |
| Jul 2026 | House Bill 10279 filed to make the subsidy's trigger, amount and **distribution mechanism** permanent | [HB 10279](https://docs.congress.hrep.online/legisdocs/basic_20/HB10279.pdf) |
| Sep 2026 | Central Luzon stations stopped honoring the discount over late reimbursement; the LTFRB is clearing a billing backlog and proposes ₱20 per liter | [Daily Tribune](https://tribune.net.ph/2026/09/15/ltfrb-to-propose-p20-per-liter-fuel-subsidy-for-puvs) |
| Earlier | Some operators withdrew card-based aid as cash instead of buying fuel | [Inquirer, 2022](https://newsinfo.inquirer.net/?p=1571333) |

**The pattern:** every channel breaks on one of three things.

| Channel | Breaks on | What goes wrong |
| --- | --- | --- |
| Discount at the pump | **Speed** | Stations front the discount and wait to be reimbursed; some stop honoring it |
| Cash cards | **Purpose** | Money can be withdrawn and spent on anything |
| Cash payout events | **Access** | Drivers queue, lose trips, and some never claim |

**The insight:** today every rule is checked *after* the money moves. If the money checks its own rules at
the pump, and the station is paid in the same moment, all three failures go away together.

## 2. Users and their jobs

| User | Job to be done | What Pasada gives them |
| --- | --- | --- |
| Jeepney driver | "Get the subsidy into my tank without queues or paperwork" | Tap the jeepney's card at any accredited pump |
| Gas station | "Honor the subsidy and get paid fast" | The station agent claims each payment within seconds |
| Program office (transport cooperative, LGU, later LTFRB) | "Every peso becomes fuel for an eligible vehicle, and I can prove it" | Rules enforced at payment, a live audit trail, top-ups only when needed |
| Judges (for this hackathon) | "Does the agent truly decide, request or make the payment, end to end on Testnet?" | Every decision shows its reasons beside a real transaction link |

First real customer (pitch): a transport cooperative or an LGU running its own fuel aid (like Manila's
e-fuel cards). National programs are the scale path. *Hypothesis to validate, not a sourced fact:*
cooperatives manage fuel spending for their units.

## 3. The concept

```
Program office (owner wallet)
   │  registers each jeepney's card, sets the agent's limits, funds its escrow   ← Noir
   ▼
Jeepney card (NFC tag UID → device hash) ── Noir escrow, policy: cap per fill, asset, expiry
   │
   ▼
Vehicle agent (holds the jeepney's constrained Noir agent key, runs on our server)
   • DECIDES each fill: accredited station? weekly cap? tank capacity? too soon?
   • MAKES the payment: checkPayment → authorizePayment to the station        ← Noir
   • REQUESTS money: when the escrow runs low, sizes a top-up from its own usage
     and creates a Velo checkout for the program treasurer                    ← Velo
   ▼
Station agent (merchant assistant): watches payment.authorized and claims     ← Noir
Velo: payment.succeeded webhook (verified) → server funds the escrow           ← Velo → Noir
```

How this maps to the handbook's definition of an agentic payment ("chooses **when, whom and how much**"):

| Handbook | Pasada |
| --- | --- |
| When | Pays now, holds for review, or holds until funds arrive |
| Whom | Only accredited stations; refuses anyone else before touching the chain |
| How much | Caps liters at tank size and the 150 L weekly allowance; sizes its own top-up requests |
| Decides / requests / makes | All three, in one product |

## 4. The demo world (fictional names, Testnet money)

**Program:** "QC Jeepney Fuel Aid (demo)". Subsidy **₱12 per liter**, represented on Testnet as
**0.1 XLM per liter**. Display conversion: **₱120 = 1 XLM** (always label it "demo rate").
Weekly allowance **150 L per vehicle** (the real 2026 cap). Program ends **2026-12-31 23:59:59 PHT**.

| Vehicle | Plate | Route | Tank | Card UID (typed) | Initial escrow | Per-fill cap on Noir |
| --- | --- | --- | --- | --- | --- | --- |
| J1 | NVE 1234 | Cubao – Quiapo | 60 L | `04A1B2C3D4E501` | 12 XLM (₱1,440) | 6 XLM (60 L) |
| J2 | TXR 5678 | Fairview – Commonwealth | 50 L | `04A1B2C3D4E502` | 12 XLM (₱1,440) | 5 XLM (50 L) |
| J3 | PUJ 9012 | Novaliches – Blumentritt | 60 L | `04A1B2C3D4E503` | 3 XLM (₱360) | 6 XLM (60 L) |

| Station | Name | Accredited |
| --- | --- | --- |
| S1 | Bituin Fuels — EDSA Cubao | Yes |
| S2 | Silangan Gas — Commonwealth | Yes |
| S3 | Kanto Fuel Depot | **No** |

Station and program names are invented on purpose. Do not use real brand names or logos.

## 5. Scenarios (these are the acceptance tests; run them in this order on a fresh setup)

| ID | Action | Expected result |
| --- | --- | --- |
| **S1 Normal fill** | J1 at S1, 40 L | `APPROVED` 40 L, 4 XLM (₱480). `authorizePayment` tx link shown. Station agent claims within ~20 s; claim tx link appears. J1 weekly use 40/150 L. |
| **S2 Overfill** | J2 at S2, 80 L | `APPROVED_CAPPED` 50 L, 5 XLM (₱600). Reason `OVER_TANK_CAPACITY`: "Requested 80 L but this jeepney's tank holds 50 L." |
| **S3 Too soon** | J1 at S1 again (within 60 min of S1), 30 L | `HELD` with reason `TOO_SOON`: 40 L + 30 L is more than J1's 60 L tank within an hour. Appears in "Held for review". No transaction. (P1: program clicks Approve → paid.) |
| **S4 Not accredited** | J2 at S3, 20 L | `REFUSED` with reason `UNACCREDITED_STATION`. No transaction. |
| **S5 Agent asks for money** | J3 at S1, 40 L | `checkPayment` says `insufficient_escrow` (3 XLM < 4 XLM) → `HELD` with reason `AWAITING_FUNDS`. The agent immediately creates a top-up request of **13 XLM (₱1,560)** with its reasoning, and a Velo checkout link. The treasurer opens the link and pays. Velo confirms (signed `payment.succeeded` webhook, or the status poller) → server calls `fundEscrow` → J3 escrow becomes 16 XLM → the held fill is processed automatically → `APPROVED` 40 L → station claims. |
| S6 Weekly cap (unit test only) | Vehicle with 150 L used this week | `REFUSED` `WEEKLY_CAP_REACHED` |
| S7 Program closed (P2, admin) | Close J2 | `unlinkDevice` sweeps the whole escrow back to the program wallet; tx link shown |

## 6. Scope

**In (must ship):** setup scripts; vehicle agent with the rules above; station agent; Velo top-up loop;
one-page website (pump simulator, agent decision log, program dashboard); deployed server and web;
README in the handbook's format; 2-minute demo video.

**Out (say so in "What's next"):** real NFC hardware (typed UIDs instead), mobile app, PHP stablecoin
(XLM stands in), PDAX peso payout to stations, Velo Gas Station fee sponsorship, government
integrations, KYC, mainnet, multiple programs.

## 7. Glossary

- **Card / tag / device:** the NFC sticker on the jeepney. Only its SHA-256 hash goes on-chain.
- **Escrow:** the jeepney's subsidy balance held by Noir's `payment_escrow` contract.
- **Policy:** what the jeepney's agent key may spend: one asset, a per-payment cap, an expiry.
- **Tranche / top-up:** money the vehicle agent asks the program for, through a Velo checkout.
- **Held fill:** a fill the agent did not pay yet (needs program review, or waiting for funds).
