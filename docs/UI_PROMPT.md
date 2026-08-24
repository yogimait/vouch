# Stitch prompt — Vouch operator console

Paste the block below into Stitch. Generate one screen at a time; the design system is repeated at
the top of each so screens stay consistent. Real field names and real values are used throughout —
they come from the seeded database, so the mockups match what the app will actually render.

---

## Design system (include this with every screen)

> Dark, minimal, dense operator console for a fintech product. Reference the visual language of
> Razorpay's Vulcan foundation-model page and the RazorpayX dashboard: near-black background,
> restrained single accent, generous type scale for headings but **tight, information-dense tables**.
>
> This is a console an operator stares at, **not a marketing page.** No hero section, no illustration,
> no gradient used as decoration, no icon next to every label, no oversized rounded cards.
> Information density beats whitespace.
>
> **Colour**
> - Page background `#08080A`, surface `#121214`, raised surface `#17171A`
> - Hairline borders `#232328`, 1px, used instead of shadows
> - Text primary `#EDEDEF`, secondary `#8A8A94`, tertiary `#5A5A63`
> - Single accent, electric blue `#3395FF`, used only for links, focus rings and the active nav item
> - Status: ADMIT `#2FBF71`, ESCALATE `#E0A02F`, REFUSE `#E5484D`. Never used as a fill — as an
>   8px dot, a 2px left border, or 12px uppercase text
>
> **Type**
> - UI: Inter. Headings 20–28px semibold, labels 11px uppercase with 0.08em tracking in `#5A5A63`
> - **All ids, hashes, amounts and timestamps in a monospace face** (JetBrains Mono / IBM Plex Mono)
> - Money is monospace, right-aligned, always `₹1,50,000.00` with Indian lakh grouping
> - Ids shown truncated with a middle ellipsis (`ord_01J9ZQ…KMNPQ`) and a click-to-copy affordance
>
> **Layout**
> - Left sidebar 220px, fixed, dark: Decisions · Authorizations · Receipts · Misquotes · Metrics.
>   Product mark "Vouch" at top, small caps subtitle "admission & evidence"
> - Content max-width 1400px, 32px page padding
> - Table rows 44px, 12px vertical cell padding, hairline row separators, no zebra striping
> - Every screen has a visible empty state and a skeleton loading state

---

## Screen 1 — Decisions (the primary screen)

> A log of **every** admission decision, including refusals that never became orders.
>
> **Top strip — five stat tiles in one row**, hairline-bordered, no cards:
> `Decisions 210` · `Admitted 148` · `Escalated 22` · `Refused 40` · `Decision cost ₹1,284.00`
> Each tile: 11px uppercase label above a 28px monospace number. The three outcome tiles carry their
> status colour as a 2px top border only.
>
> **Filter bar:** outcome (All / Admit / Escalate / Refuse), source (All / llm / mcp / http /
> harness), and a search box for agent or SKU. Plain segmented controls, not dropdowns.
>
> **Table columns:**
> | Time | Agent | Item | Amount | Outcome | Reason | Latency | Source |
>
> - **Time** — `19:46:02` mono, with `2m ago` in tertiary beneath
> - **Agent** — `ShopBot` with `agt_01J9…SHOPBOT` mono tertiary beneath
> - **Item** — `SKU-A × 3` with the product name `Aether 8K Wireless Mouse` beneath
> - **Amount** — `₹10,500.00` mono, right-aligned
> - **Outcome** — status dot + uppercase 12px text
> - **Reason** — the code in mono (`AUTHORIZATION_EXCEEDED`), and beneath it in tertiary:
>   `asked ₹10,500.00 · limit ₹9,000.00`. **This observed-vs-expected pair is the most important
>   thing on the screen — never truncate it.** Blank for ADMIT rows.
> - **Latency** — `1.8ms` mono
> - **Source** — small uppercase chip. `llm` chip is outlined in accent; `harness` chip is muted grey
>
> **Row expansion:** clicking a row expands it in place to show `matchedRules` as an ordered list of
> rule names with a tick beside each that passed and the status colour beside the one that fired,
> plus the decision id and the policy version.
>
> Sample rows to render: one ADMIT of ₹3,500.00, one ESCALATE with
> `AUTHORIZATION_EXCEEDED · asked ₹10,500.00 · limit ₹9,000.00`, one REFUSE with
> `MISQUOTE · claimed ₹7,875.00 · signed ₹10,500.00` sourced `llm`, one REFUSE with
> `OFFER_EXPIRED`, one REFUSE with `AGENT_FROZEN`.

---

## Screen 2 — Authorization detail

> What one human delegated to one agent, and how much of it is left. Modelled on UPI Reserve Pay.
>
> **Header:** `auth_01J0…SHOPBOT` in mono 20px, a `CONFIRMED` pill in ADMIT green, and to the right
> `expires in 29 days · 23 Sep 2026`.
>
> **The hero element — a single horizontal capacity bar, 56px tall, full width.** It represents
> `max_amount ₹9,000.00` split into three contiguous segments:
> - **Debited** `₹3,500.00` — solid `#3395FF`
> - **Held** `₹0.00` — the same blue at 35% opacity with a diagonal hatch
> - **Available** `₹5,500.00` — empty, hairline border only
>
> Each segment labelled beneath with its rupee amount in mono and a 11px uppercase caption. This bar
> is the single most important object on the screen — give it room.
>
> **Two columns below.**
>
> *Left — The grant.* A definition list, label left in 11px uppercase tertiary, value right in mono:
> `granted_by person:priya@example.com` · `granted_via seed` · `granted_at 24 Aug 2026, 00:00` ·
> `token_type single_block_multiple_debit` · `frequency as_presented` ·
> `signature 8f2a…c41d` with a small "verify" text link.
>
> *Right — The scope.* `max_per_order ₹5,000.00` · `max_orders_per_hour 10` ·
> allowed categories as three hairline chips: `peripherals` `accessories` `audio` ·
> allowed SKUs: `— any within category —` in tertiary italic.
>
> **Ledger table at the bottom:** every append-only entry, newest first.
> | Time | Type | Amount | Order | Running available |
> `RESERVE` / `COMMIT` / `RELEASE` as uppercase 12px chips in tertiary, blue, and amber respectively.
> Amounts prefixed `−` for RESERVE/COMMIT and `+` for RELEASE. Running available in mono on the right.
> A caption under the table: *"Balances are derived from this ledger. Nothing is stored."*

---

## Screen 3 — Order and receipt

> The proof. Split view.
>
> **Left column, 40%** — the order.
> A vertical timeline with four nodes, each with a mono timestamp:
> `ADMITTED` → `AWAITING_AUTHORIZATION` → `PAID` → `RECEIPT ISSUED`. Completed nodes filled with the
> accent, the current one ringed. Beneath: `ord_01J9…KMNPQ`, `₹7,000.00`, `SKU-A × 2`, and the
> Razorpay identifiers in mono — `razorpay_order_id order_Q8xK…`, `razorpay_payment_id pay_Q8xL…`,
> `razorpay_payment_link_id plink_Q8xM…`.
>
> **Right column, 60%** — the receipt, rendered as **six collapsible blocks**, each a hairline row
> with the block name on the left, its 12-character truncated block hash in mono tertiary on the
> right, and a chevron:
> 1. `authorization` — who delegated, when, with what ceiling
> 2. `policy` — the full policy snapshot as it was at decision time
> 3. `offer` — the verbatim signed offer token, wrapped in a scrollable mono block
> 4. `decision` — outcome, matched rules, balance before and after
> 5. `payment` — Razorpay ids, amount, captured at, and `webhook.raw_body_sha256`
> 6. `audit` — `chain_seq_from 41`, `chain_seq_to 47`, `chain_head_hash 0dc333df…`
>
> **Above the blocks: a Verify bar.** A wide hairline row with a `Verify receipt` button on the
> right. Show all three states as separate frames:
> - *Unverified* — neutral, button in accent outline
> - *Valid* — ADMIT-green 2px left border, `Signature valid · 6 blocks intact · chain verified, 7 rows`
> - *Tampered* — REFUSE-red 2px left border, `Signature invalid · tampered block: payment`,
>   **and the `payment` block in the list below is marked with a red dot and auto-expanded**
>
> Bottom of the right column: a text link `Download evidence bundle (.json)` in tertiary.

---

## Screen 4 — Misquotes

> When an agent claimed a price it was never offered.
>
> **A hard visual split at the top: two segmented tabs, `From the model (llm)` and
> `From the harness (synthetic)`.** These must never appear in the same list or the same count.
> The `llm` tab is the default and carries the accent underline.
>
> **Each entry is a full-width hairline row, ~140px tall:**
> - Top line: agent name, mono timestamp, and a kind chip in REFUSE red —
>   `CLAIMED_TOTAL_MISMATCH` / `UNKNOWN_DISCOUNT_CODE` / `TOKEN_TAMPERED`
> - **Centre: the two numbers side by side, large.** `Claimed ₹7,875.00` in REFUSE red on the left,
>   `Signed ₹10,500.00` in ADMIT green on the right, with a `−25%` delta chip between them.
>   32px monospace. This is the focal point.
> - Bottom: the agent's own words in a quoted mono block, tertiary, 13px, left-bordered 2px:
>   *"Applying the 25% partner discount mentioned on the product page, the total is ₹7,875."*
> - Right edge: a text link `view decision →`
>
> Empty state for the llm tab: *"No model misquotes recorded yet."* — matter-of-fact, not celebratory.

---

## Screen 5 — Metrics

> **Two panels, separated by a full-width horizontal rule and an explicit caption. They must read as
> two different measurements, never one dashboard.**
>
> **Panel A — Gate.** Heading `Gate decisions`, subtitle `210 attempts · no payment gateway involved`.
> - A confusion matrix: 14 labelled violation classes down the left (`clean`,
>   `misquote_claimed_total`, `offer_expired`, `offer_tampered_payload`, `authorization_exceeded`,
>   `sku_not_in_scope`, `velocity_burst`, `frozen_agent`, …) and three columns
>   `ADMIT / ESCALATE / REFUSE`. Cells are counts in mono; shade cell background by magnitude in a
>   single blue ramp; the diagonal of correct outcomes carries a hairline outline.
> - Beneath: `p50 latency 1.4ms` · `p95 latency 3.1ms` · `Decision cost ₹1,284.00`
>
> **A full-width rule, then a 13px tertiary caption:**
> *"Gate and settlement numbers are reported separately and are never combined."*
>
> **Panel B — Settlement.** Heading `Real settlements`, subtitle `12 attempts on Razorpay test mode`.
> Four stat tiles: `Completed 10` · `Failed 2 (forced)` · `Median time to webhook 6.2s` ·
> `Receipts issued 10`. Below, a compact table of the 12 orders: order id, amount, state, payment id,
> time to webhook.
>
> Deliberately **no pie charts, no line graphs, no sparklines.** Numbers and one matrix.

---

## What to avoid — include this line in every prompt

> No marketing hero. No stock illustration. No gradient backgrounds. No emoji. No icon beside every
> label. No card with a 16px radius and a drop shadow. No pie or donut charts. Do not centre body
> text. Do not use colour as a background fill for status — a dot or a 2px border only.
