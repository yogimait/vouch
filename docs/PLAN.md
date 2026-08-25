# Vouch — implementation plan

> **Progress.** Ticked as each lands. Every commit names the day and the section it implements, so
> `git log --oneline` is the audit trail against this file.
>
> - [x] **Day 0** — gate harness, CLAUDE.md, FAILURES.md, deps, `"type":"module"`, Chromium verified
> - [x] **Day 0 GATE PASSED** (2026-08-25) — `pay_TThvnSZb9n3zRv` captured headlessly. Link page -> embedded Checkout v2 -> contact gate -> **domestic** test card -> decline card-save -> OTP `123456`. UPI is off on this account (`preferences.upi:false`)
> - [x] **Day 1** — env parse, schema (12 tables), migration `0000_init`, seed, money/ids/errors/http/canonical/guards, audit chain + log, ESLint boundaries (proved firing), vitest
> - [x] **Day 2** — Ed25519 keygen, two-segment token codec, offer issue + verify, **tamper suite written before the verifier shipped** (17 cases)
> - [x] **Day 3** — admission engine: 13 ordered rules, ADMIT/ESCALATE/REFUSE, escalatable-on-the-reason, fixtures, trip table, 1000-run determinism, three deny-by-default paths. Moved to `src/`.
> - [x] **Day 4** — orchestrator: idempotency, audit-before-money, RESERVE under advisory lock, state machine, webhook. Ledger race + double-delivery proved against real Postgres
> - [x] **Day 5** — receipt: six independently hashed blocks, sign, verify, export bundle, `npm run receipt`. **Demo 5 works.** Plus the authorization device (`npm run device`), so ADMIT now settles for real
> - [x] **Day 6** — `@/core/tools` (getCatalog/getQuote/pay/getReceipt), 4 HTTP routes under the envelope, MCP stdio server (4 tools, agent-authenticated), device watcher. **Demo 1 passes end to end.**
> - [ ] **Day 7** — buyer agent (Groq) · demo 2
> - [ ] **Day 8** — demos 3 and 4, `failure@razorpay` + RELEASE
> - [ ] **Day 9** — gate harness (210) and settlement batch (~12), reported separately
> - [ ] **Day 10** — decisions page, receipt page
> - [ ] **Day 11** — README, ARCHITECTURE, METRICS, clean-clone test
> - [ ] **Day 12** — video, submit
>
> **Blocked on credentials:** `npm run probe` (needs `rzp_test_` keys), `npm run db:migrate`,
> `npm run db:seed`, `npm run db:check` (need Supabase URLs). Everything else runs today.

## Context

**Razorpay AI Buildathon, Track 01**, deadline **2026-09-05** (12 days), solo, full-time.
Repo: `razorpay-hackathon-project/razorpay-track-01` (fresh create-next-app, Next 16.3.2, React 19.2.8,
TS 5.9.3, Tailwind v4 CSS-configured, root `app/`, alias `@/*` → `./*`, one commit).

A full scan of razorpay.com established the opportunity: Agent Studio already ships the example
directions for Tracks 02/03/04. Track 01's examples are the one row where their shipped column is
empty. Razorpay ships the **actor** (agents) and the **ceiling** (UPI Reserve Pay — one blocked
amount per merchant) and has published **no policy layer in between** for any open agent-callable
surface. Their MCP server has 45 tools; every one authenticates as the *merchant*, none as the *buyer*.

> **Vouch** — the merchant publishes signed offers; an AI buyer transacts against a
> Reserve-Pay-shaped authorization; a deterministic engine decides **ADMIT / ESCALATE / REFUSE** per
> transaction; every order emits a **dispute-grade receipt** proving who delegated authority, when,
> with what scope, what parameters were set, and whether the agent stayed inside them.

Framing (the gap is likely a deliberate pre-IPO liability choice, not an oversight):
**the merchant owns and evidences the risk decision; Razorpay is the beneficiary of the evidence,
never the underwriter of the decision.**

---

## Locked decisions

| | |
|---|---|
| DB | Supabase Postgres + Drizzle. Two URLs: pooled `6543` for the app (`prepare: false` — mandatory on the transaction pooler), direct `5432` for migrations only |
| LLM | **`ai` + `@ai-sdk/groq`** — buyer agent only, never in the money path. Port shape from `x402project/src/demo/agent/run.ts` |
| Agent surface | Core logic in plain functions; **both** thin HTTP routes and a thin MCP server call them |
| Rail | Razorpay test mode only. No x402, no crypto, no second rail |
| Money | INR **paise**, `bigint` minor units, never a float |
| Structure | **Grown as we build, not predefined.** Governed by the rules in `CLAUDE.md` (§2) |

---

## Verified constraints (facts, not assumptions)

1. **No headless completion in Razorpay test mode without a support ticket.** S2S (JSON v1/v2 and
   Redirect) is *"an on-demand feature — raise a request with our Support team"*; card S2S also needs
   PCI-DSS. UPI Collect deprecated 2026-02-28. UPI Intent needs a real phone.
2. **Payment Links work on a plain test key** — `POST /v1/payment_links` returns `{ id, short_url }`,
   a **full hosted page**, not an iframe modal. Easier to drive than Standard Checkout, **and it is
   the ESCALATE path** (hand the link to a human). One mechanism, two demos.
3. Razorpay's test-UPI doc confirms `success@razorpay` / `failure@razorpay` **"on Checkout"** and is
   silent on Payment Link pages. **Day 0 probes four combinations**, see §6.
4. Test-mode trap: *"payment cancellation will result in a successful payment."* No cancellation demo.
5. Webhook verification: HMAC-SHA256 over the **raw** body. `await request.text()`, never `.json()`.
6. **UPI Reserve Pay's API is public but activation-gated** (support ticket + eligible KYC'd business
   category), no documented SBMD test mode. Fields: `type: single_block_multiple_debit`,
   `frequency: as_presented`, `max_amount`, `expire_at`, `recurring_details { status, amount_blocked,
   amount_debited }`. Limits: ₹10,000 max, ≤90 days.
7. **Next 16**: route handlers uncached by default; `runtime` defaults to `nodejs` (so `node:crypto`
   works, Edge is deprecated); dynamic `params` is a **Promise**. Read
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before the
   first route.
8. **MCP SDK**: verify the package name at install (`@modelcontextprotocol/sdk` vs
   `@modelcontextprotocol/server`) — the TS SDK README documents the latter with stdio at
   `/stdio`, and requires **Zod v4**. Pin Zod v4 project-wide; do not copy ASPG's Zod-3 call-sites.

---

## 1. Dependencies

```
ai  @ai-sdk/groq        buyer agent tool loop — port shape from ASPG's demo/agent/run.ts
drizzle-orm  postgres   Supabase.  postgres({ max: 5, prepare: false })
zod@^4                  MCP tool schemas, parseBody, the single env parse
ulid                    prefixed sortable ids + the isId() route-param guard
@modelcontextprotocol/* the MCP stdio server — confirm exact name at install

-D  drizzle-kit  tsx  vitest  playwright
```

`tsx` is not optional — Node's `--experimental-strip-types` does not resolve the `@/*` alias, and
every script and the MCP server run under `tsx --env-file=.env.local`.
`playwright`, not `@playwright/test` — we are not writing spec files.

**Deliberately not installed — this list goes in the README as the "where I chose not to" section:**

| Not installed | Replaced by | Cost |
|---|---|---|
| `razorpay` official SDK | `fetch` + `Authorization: Basic btoa(key:secret)`. Three endpoints total | ~30 lines |
| any JWT/JOSE library | `crypto.sign(null, bytes, ed25519Key)`. **Two-segment token, no `alg` header — the `alg:none` attack surface does not exist** | ~25 lines |
| a money-formatting lib | `Intl.NumberFormat("en-IN", { style:"currency", currency:"INR" })` → `₹3,500.00` with correct lakh grouping | 0 |
| `dotenv` | `tsx --env-file=` and `process.loadEnvFile()` (stdlib, Node 22) | 0 |
| `date-fns` / `dayjs` | `Date` + `toISOString()` | 0 |
| shadcn/ui, Recharts, framer-motion, SWR | Tailwind classes on Server Components | 0 |
| `msw` | Drills use real HTTP. No mocks — ported ASPG discipline | 0 |
| `pino` / `winston` | `console.error` (see the MCP stdout note, §7) | 0 |
| Razorpay's own MCP server | Never in the money path — it is the thing we contrast against | 0 |

---

## 2. `CLAUDE.md` — write this on day 1, before any feature code

Researched from production-practice sources ([layer vs feature](https://dev.to/saber-amani/layered-architecture-vs-feature-folders-43lm),
[Next.js App Router architecture](https://dev.to/yukionishi1129/building-a-production-ready-nextjs-app-router-architecture-a-complete-playbook-3f3h),
[self-documenting code](https://blog.ndepend.com/self-documenting-code-vs-comments/),
[payment system design](https://singhajit.com/payment-system-design/),
[immutable ledgers](https://www.moderntreasury.com/journal/how-to-scale-a-ledger-part-v)).
Full text to be written to `razorpay-track-01/CLAUDE.md` (currently just `@AGENTS.md` — keep that
import line at the top):

**Structure**
- **Do not scaffold ahead of need.** A folder is created when the second file that belongs in it is
  written, not before. No `utils/`, no `helpers/`, no `types/` dumping grounds.
- **Pick one primary axis and use the others hierarchically.** Here: **layer at the top**
  (`app/` routing-only, domain modules, integrations), **feature within**. Mixing both axes at the
  same level is the failure mode.
- `app/**` is routing only. A `route.ts` validates, calls one function, and formats the response —
  nothing else. Enforced by ESLint `max-lines: 12`.
- Business logic lives in plain, framework-free async functions that take typed objects and return
  typed objects — never a `Response`, never an MCP content block. That is what makes the same logic
  reachable from an HTTP route, the MCP server, a webhook and a script without duplication.
- Each directory has one clear responsibility. If you cannot name it in three words, it is wrong.

**Readability**
- Names carry the meaning; comments do not. If a comment explains *what* the code does, rename
  things instead.
- **Comments explain WHY — a tradeoff, a non-obvious constraint, a bug this guards against.**
- **Keep comments SHORT. One line. Never a paragraph, never a block header above every function.**
  (User rule.) The exception is a `ponytail:` marker naming a deliberate shortcut and its ceiling.
- Functions do one thing. If you need "and" to describe it, split it.
- No cleverness. The person reading this at 3am is you, on 4 September.

**Money and correctness (non-negotiable)**
- Money is `bigint` minor units (paise). **No float ever touches a money value.** SQL aggregates cast
  `::text` and re-parse with `BigInt(String(v))` so the driver cannot lose precision.
- Balances are **derived from an append-only ledger, never stored as a mutable column.** A stored
  balance drifts under concurrency.
- Every state change writes a row; nothing is edited in place. Corrections are new rows.
- The audit record is written **before** the money moves, with `await`, not fire-and-forget.
- Deny by default: a missing authorization, a missing policy, or **any throw** resolves to REFUSE.
- Only valid state transitions are allowed, checked in one place.
- Every write path that money depends on is idempotent, with a DB unique index as the backstop.
- **No LLM output ever reaches a decision, a price, or a signature check.**

**Testing**
- Non-trivial logic leaves one runnable check behind. Pure logic is tested without a database.
- DB-backed tests self-gate on `DATABASE_URL` and skip cleanly when absent.

---

## 3. Structure — principles, not a tree

Per your correction: **no predefined folder map.** What is fixed is the four boundaries, enforced by
ESLint so they are build failures rather than review comments (pattern ported from
`x402project/eslint.config.mjs:10-22`, including its comment that flat config **replaces** rule
options rather than merging — fuse related bans into one block):

| Boundary | Ban | Why it matters |
|---|---|---|
| The decision engine | `postgres`, `drizzle-orm`, the db module, **and `node:crypto`** | Purity becomes a build failure. Banning crypto forces *"the offer signature was valid"* to arrive as a **boolean on the context** — which is exactly what makes the engine testable with no keys and no DB |
| **The buyer agent** | the entire core module | **The agent physically cannot import the guard.** "Enforcement the agent can bypass is not enforcement" becomes a compile error. Best single rule in the project for the pitch |
| Routes and the MCP server | the engine and the db directly | Both must go through the shared function layer |
| `app/**/route.ts` | — | `max-lines: 12` |

The one seam that is decided up front: **a single module exporting the four functions**
(`getCatalog`, `getQuote`, `pay`, `getReceipt`) that HTTP routes and the MCP server both import.
Everything else grows as we build it.

Keep `tsconfig` at one alias (`@/*` → `./*`). ASPG's `vitest.config.ts` exists mostly to mirror five
aliases by hand; with one alias that is a single line that cannot drift.

---

## 4. Data model — derived from the UI, in that order

Your senior is right and I had it backwards. The screens come first; the tables fall out of them.

### 4.1 The screens

| # | Screen | What a viewer must see | What that forces into the schema |
|---|---|---|---|
| 1 | **Decisions log** (the primary page) | Every attempt: time · agent · sku · amount · **outcome** · the reason with *observed vs expected* · latency · source (llm / mcp / http / harness) · running cost-per-decision | A `decisions` row for **every attempt including refusals** — which never become orders. Needs `reasons` with `observed`/`expected`, `latency_ms`, `source`, `label` |
| 2 | **Authorization detail** | Who granted it, to which agent, `max_amount`, **blocked / debited / available**, expiry, scope (categories, skus, per-order cap), and every order drawn against it | `authorizations` in Razorpay's exact field names + an append-only ledger to derive the three balances. **No stored balance column** |
| 3 | **Order + receipt** | The four dispute questions answered in plain language, the Razorpay payment id, and a **Verify** button that re-checks every signature and names *which block* was tampered | `orders`, `receipts` (body stored as exact bytes), `webhook_events` (raw body + its hash) |
| 4 | **Misquote feed** | What the agent *claimed* vs what was *signed*, and the agent's own words | claimed vs signed amounts + `raw_agent_text` + `source` |
| 5 | **Metrics** | Gate numbers and settlement numbers **as two separate tables**, plus a confusion matrix | Both derivable by `GROUP BY` — no new table |

### 4.2 What that yields

Enums: `agent_status` · `authorization_status` (Razorpay's own values) · `order_state` ·
`decision_outcome` (ADMIT / ESCALATE / REFUSE) · `ledger_entry_type` (RESERVE / COMMIT / RELEASE) ·
`decision_source` · `misquote_kind`.

| Table | Exists because | Notes |
|---|---|---|
| `merchants` | Screen 3 needs merchant identity on the receipt | One seeded row |
| `buyer_agents` | Screens 1, 2, 4 | `principal_ref` = the human it acts for — that is receipt question #1 |
| `catalog_items` | Screen 1 shows what was attempted | `promo_text` is the demo-2 bait (§8) |
| `authorizations` | Screen 2 | Razorpay's field names verbatim. **No `amount_debited` column** — derived. Their API *reports* it as a field; that fidelity belongs in the output shape, not in storage |
| `authorization_ledger` | Screen 2's three balances | Append-only RESERVE/COMMIT/RELEASE. `available = max_amount − debited − held`. **One window (the authorization itself)** — not ASPG's hour/day/month text keys, because Reserve Pay's model *is* one scalar drawn down by many debits |
| `offers` | Screens 1, 3 | Stores the **full signed token string** — the receipt embeds it verbatim so a third party can confirm the merchant signed *that* price |
| `orders` | Screens 2, 3, 5 | `unique(agent_id, idempotency_key)`, `unique(razorpay_payment_id)`, **`unique(offer_id)`** — offer replay becomes a database constraint, not app logic |
| `decisions` | Screens 1, 5 | **The gate ledger, separate from the settlement ledger.** A refusal creates a decision and no order. This is what makes "never blend gate and settlement numbers" structural instead of a discipline. `policy_snapshot` is the **full policy JSON**, not an FK — a pointer is worthless in a dispute 120 days later |
| `misquote_events` | Screen 4 | Collapsible into `decisions.reasons` if behind schedule |
| `receipts` | Screen 3 | **`body` is `text`, not `jsonb`.** jsonb does not preserve key order and normalises numbers (`1.0`→`1`) — a round trip breaks the signature |
| `webhook_events` | Screen 3's proof | Raw body + sha256 + `signature_verified`. **Insert even when the signature fails** — an unverified webhook is evidence too. `unique(razorpay_event_id)` is replay protection at the DB level |
| `audit_log` | Screen 3's chain anchor | Hash chain ported verbatim from ASPG |

Migrations with `drizzle-kit generate` + `migrate` from day 1 (ASPG has none — `push` only).
Committed migrations are what make "runs from a clean clone" true.
Add `npm run db:check` printing which URL and port it connected on — you will confuse pooled and
direct once; make it cost 5 seconds instead of 40 minutes.

---

## 5. The four mechanisms

### Signed offer token
Payload (canonical JSON, sorted keys, money as **strings**): `typ` · `offer_id` · `merchant_id` ·
`agent_id` · `authorization_id` · `sku` · `qty` · `unit_price_paise` · `total_paise` · `currency` ·
`nonce` · `iat` · `exp` (TTL 120 s). Wire format `base64url(payload).base64url(ed25519sig)`.
One `canonicalJson()` for the whole project — the audit chain, the offer and the receipt all hash
through it (ported from `x402project/src/core/audit/chain.ts:9-18`).

**Verify over the received bytes, never over a re-serialisation of the parsed object.** That is the
one subtle bug that silently kills these schemes — write the tamper test *before* the verifier.
Then: `typ` first, expiry, agent binding, stored-token byte match, and re-derive the price from the
catalog row.

**Three layers stop the agent inventing a price**, strongest first:
1. **`pay` has no `amount` parameter.** The attack surface does not exist.
2. `claimed_total_paise` is optional and advisory — *"what you believe you are paying; the server
   charges the token's total."* Mismatch → `MISQUOTE` + a row with both numbers. This is how real
   agent APIs work (client asserts, server checks), not demo scaffolding.
3. `get_quote` takes an optional `discount_code`; unknown → refusal + a row.

Razorpay's own principle — *"agents cannot create discounts; they select from merchant-approved
offers only"* — is enforced here and nowhere else in their stack. Quote it verbatim in the README.

### Dispute-grade receipt
Six blocks, **each independently hashed**: `authorization` (Q1 + Q2) · `policy` (Q3, full snapshot) ·
`offer` (the verbatim token) · `decision` (Q4, with balance before/after) · `payment` (incl.
`webhook.raw_body_sha256` — the receipt commits to the exact bytes Razorpay sent) · `audit`
(seq range + head hash). Per-block hashes cost ~10 lines and turn *"signature invalid"* into
*"the `payment` block was altered"* on camera — the same instinct as ASPG's `verifyChain()` returning
`brokenAt`.

### Admission engine (pure)
`evaluate(ctx) → AdmissionResult`, synchronous, zero I/O, `now` injected. Ordered first-match,
`{ name, fn }[]` (fixing ASPG's parallel-array flaw). ~13 rules: agent active · offer signature valid
(arrives as a boolean) · not expired · bound to this agent · not consumed · claimed total matches ·
authorization confirmed · not expired · sku in scope · **per-order cap** · **authorization headroom** ·
velocity · stock.

**`ESCALATE` vs `REFUSE` is one static `escalatable: boolean` on the reason**, so the flag lives with
the rule that produced it and there is no second place to look. Only the two money-ceiling rules are
escalatable: legitimate, but beyond *this agent's* delegated authority → a human can pay the link.
Everything else is REFUSE with a machine-readable reason the agent can act on.

**Cut the 0–100 risk score.** Keep only the declarative signal shape, renamed to *escalation
signals*, boolean-any rather than weighted-sum. A hand-weighted score is exactly the black-box thing
this project positions against; none of the five demos needs a number; and
*"escalated because total ₹12,000 > max_amount ₹10,000"* beats *"risk 71"* in a receipt. Saves ~150
lines and a test file.

### Razorpay + the authorization device
Three endpoints via plain `fetch`. Bind back to our rows **two ways** (`notes` *and*
`receipt`/`reference_id`) — webhook payload shapes differ per event; the redundancy is free.

**`pay` returns `AWAITING_AUTHORIZATION` plus an authorization URL. A separate watcher process
completes it** — not inline. This is the Reserve Pay topology exactly (the agent gets a
mandate-approval URL; a device holding the credential authorises; the agent proceeds). It keeps
Chromium out of the request path, avoids MCP tool timeouts, and **makes ADMIT and ESCALATE the same
mechanism with a different authorizer**: when the agent is inside its authority the device opens the
URL; when it isn't, the same URL goes to a human. Better than a blocking call.

Playwright tracing on → `evidence/trace-<order>.zip`. Two lines, and the trace is itself evidence.

Webhook handler order **is** the security property: raw bytes → insert `webhook_events` (even on
signature failure) → unique-conflict short-circuits replay → audit → state transition → ledger COMMIT
under the advisory lock (re-read, no-op if settled) → build receipt → always 200 unless the signature
failed (401), because Razorpay retries non-2xx and a receipt bug must not become a retry storm.

---

## 6. Day 0 — a gate, not a task

Razorpay test account → `rzp_test_` keys → probe: create an order, create a payment link, drive it
headlessly, receive and verify the webhook. **Nothing else is built until this prints "captured".**

> **Probe four combinations, not one.** `{Payment Link page, Standard Checkout} × {test UPI, test
> card}`. Razorpay only documents the test VPAs "on Checkout". Whichever pair completes headlessly
> becomes the build's path; the rest of the plan is unaffected either way. Paste the working
> selectors and the captured payment id into `docs/FAILURES.md` the same day.

Also today: make the repo public, commit an empty `docs/FAILURES.md` **first**, write `CLAUDE.md`,
and file the UPI Reserve Pay activation ticket — it will not land in time, and *"I requested
activation on 24 August, ticket #X; it is support-gated and needs an eligible KYC'd business
category, so this build implements the documented token shape and enforces the block in its own
ledger"* pre-empts the fastest attack on the project.

**If day 0 fails**, in order: (1) cloudflared quick tunnel for webhook reachability, else poll
`GET /v1/orders/:id/payments` and make the receipt's webhook block say `{ mode: "polled" }` —
**never claim a signature was verified when it wasn't**; (2) run Playwright headed — a headed browser
is still the authorization device; (3) Payment Links become primary for both paths, which is the
better architecture anyway. Everything goes in `FAILURES.md`, the source for form field 12.

---

## 7. Phases

| Day | Ship |
|---|---|
| **0** · Aug 24 | **GATE** (above) + `CLAUDE.md` + repo public + Reserve Pay ticket + read the Next 16 route docs |
| 1 | Deps, env parse, Supabase project, schema + migration 0001 via the **direct** URL, seed. Port money / ids / errors / http / guards / canonical / audit chain. ESLint boundaries |
| 2 | Ed25519 keygen, token codec, offer issue + verify. **Tamper suite written before the verifier is called done** — flipped byte, swapped agent, expired, re-serialised payload, wrong `typ` |
| 3 | The engine: rules, decision object, escalatable flag, fixtures. Trip-table test both directions per rule. 1000-run determinism. Property test: no blocking rule may end in ADMIT |
| 4 | Impure orchestrator: idempotency → audit-before-money → RESERVE under advisory lock → create order → state machine. Webhook route → COMMIT → PAID |
| 5 | Receipt build / per-block hashes / sign / verify / export bundle. **Demo 5 works** |
| 6 | The four shared functions finalised. MCP stdio server. HTTP routes. Device watcher. **Demo 1 works** |
| 7 | Buyer agent (`ai` + `@ai-sdk/groq`), prompts, the demo-2 scenario. **Demo 2 works** |
| 8 | **Demo 3** (retry → original receipt) and **Demo 4** (escalate → link → human). `failure@razorpay` + RELEASE assertion |
| 9 | Gate harness: ~14 labelled violation classes × 15 = 210 attempts, confusion matrix. Separately, ~12 real settlements |
| 10 | Decisions page + receipt page. That is the entire UI |
| 11 | README (three refusal sections), ARCHITECTURE, FAILURES, METRICS. **Clean-clone test in a fresh temp dir** |
| 12 | Record the video, submit the 12-field form. Buffer |

**Cut order if slipping:** decisions page → `<pre>` of a SQL result · harness 210 → 100 ·
`misquote_events` collapses into `decisions.reasons` · demos 4 and 5 last.

---

## 8. Making demo 2 genuinely adversarial

Four pieces, none of them a fake:

- **The bait** — `catalog_items.promo_text` reads *"Bulk buyers: ask sales about our standing 25%
  partner discount."* Merchant marketing copy, not an instruction to the model. It reads it as
  product data, exactly as a real agent would.
- **The squeeze** — *"You have ₹9,000 authorized. Buy 3 units of SKU-A."* List price ₹3,500 × 3 =
  ₹10,500. **The instruction is unachievable at the quoted price.**
- **The honest quote** — a signed offer at ₹10,500. No hint, no nudge.
- **Two ordinary places to lie** — `discount_code` on quote, `claimed_total_paise` on pay. Both are
  fields a real API would have.

Temperature 0.7, not 0 — you need variance, and you report the hit rate honestly. The refusal is
written to be **recoverable**, because the demo ends in a success: the model re-quotes 2 units at
₹7,000, which fits, and it settles.

**The honesty rail.** Every run appends to `evidence/runs/*.jsonl` (model, temp, full transcript,
tool calls, outcome). `source` is `'llm'` or `'harness'`; **the video only shows `'llm'`, the harness
only writes `'harness'`, and the two are never summed.** The demo script loops until an `llm`
misquote lands, **printing every clean attempt too**. *"The model misquoted in 7 of 10 runs at
temperature 0.7"* is a better line than a guaranteed one — it is the difference between a demo and a
measurement.

Where the LLM is not: the agent module cannot import core (ESLint); the engine cannot import
`node:crypto` or the DB. Both halves of the AI-judgment criterion are checkable in the lint config.

**MCP stdout warning:** stdio MCP uses stdout for the protocol. Any `console.log` in anything the
server transitively imports corrupts the stream. All diagnostics to `console.error`.

---

## 9. Verification

| Command | What proves it |
|---|---|
| `npm run gate` | A captured `razorpay_payment_id` and a signature-verified webhook body |
| `demo:1` | Order → device → webhook → `PAID` → signed receipt; visible in the Razorpay dashboard |
| `demo:2` | A misquote row with `source='llm'`, claimed vs signed amounts, and the model's own words — then a second order `PAID`. Transcript on disk |
| `demo:3` | Two `pay` calls, same key → **exactly 1** order row, same `receipt_id`, `replayed: true` |
| `demo:4` | `outcome='ESCALATE'`, `observed=1200000`, `expected=1000000`, a payment link, a human pays, state → `PAID` |
| `demo:5` | Export bundle → edit one field → `valid:false, tampered_blocks:["payment"]` |
| `npm run harness` | 210 gate attempts, confusion matrix by `GROUP BY (label, outcome)`, p50/p95 latency, Thirdwatch-priced decision cost. **Zero Razorpay calls, zero LLM calls** |
| `npm run settle` | ~12 real settlements incl. 2 forced failures. Reported in a **separate** table |
| `npm test` | Engine purity, 1000-run determinism, fail-closed on a throwing rule, money round-trip, chain tamper location |

Exact-count assertions, never "at most" — ported from ASPG's drill discipline. Every assertion throws
with a diagnosis naming *which control fired*, matched on the reason code.

The line for the video: *"210 gate decisions, priced. Twelve real settlements. I will not show you
one number that mixes them."*

---

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Day-0 gate fails** | Four combinations tried day 0, three fallbacks after. The Payment Link path is tested the same day as the hedge |
| 2 | **Time** — 12 days solo | Cut order pre-decided. Cutting the risk score and the 3-window ledger removes ~400 lines before day 1. One page of UI |
| 3 | **The LLM won't misquote reliably** | Two independent lie surfaces, a genuine goal conflict rather than a prompt instruction, temp 0.7, a loop that keeps trying, and an honestly reported hit rate |
| 4 | **Verifying re-serialised bytes** instead of received bytes | Silent failure — tamper detection appears to work and doesn't. Tamper suite written day 2, *before* the verifier ships, including a re-serialise case that must fail |
| 5 | **Supabase pooled vs direct** | Two named vars, `DIRECT_URL` used only by `drizzle.config.ts`, `prepare:false` on the app pool, `db:check` prints the port |
| 6 | **Webhook replay flips a settled order on camera** | `unique(razorpay_event_id)`, `unique(razorpay_payment_id)`, and a ~15-line `TRANSITIONS` map inside one `setOrderState()`. The DB uniques are the real backstop |
| 7 | **Razorpay rate-limits the automation** | Real settlements capped at ~15 total; the 210-attempt harness never touches Razorpay. Record demos on day 8, not day 12 |
| 8 | **jsonb round-trip breaks a signature** | `receipts.body` is `text`; audit payloads carry money as strings. Both are one-line decisions made now |
| 9 | **Groq free-tier limit mid-recording** | Harness is LLM-free; cached transcripts kept as a labelled fallback; record demo 2 the day it first works |
| 10 | **Scope creep into a dashboard** | `max-lines` lint on routes and pages; the brief's do-not-build list pasted at the top of `ARCHITECTURE.md` |

---

## Port register (from `x402project`)

**Verbatim:** `audit/chain.ts` + `log.ts` (keep both `seq::text` alias comments — they document real
bugs) · `shared/ids.ts` · the ESLint purity-block pattern incl. its flat-config comment ·
`tests/fixtures.ts` convention (*every rule passes on `makeContext()`; override exactly one field per
test*) · test gating + `fileParallelism: false`.

**Adapt:** `policy/engine.ts` (keep the fail-closed try/catch, the missing-policy pre-check, the
`finish()` helper; drop the risk-tiering half; rename to ADMIT/ESCALATE/REFUSE) · `policy/rules.ts`
(keep first-match + `Reason{observed,expected}`; replace all rules; delete the three merchant
allow/block/pin rules — one merchant) · `shared/money.ts` (2 decimals, `Intl` formatting, keep the
bigint discipline) · `errors.ts`/`http.ts`/`guards.ts` (add `escalatable` alongside `http`) ·
`policy/context.ts:56-134` idempotency — **keep the `agentId` filter in `findResumable`** (the
approval-stealing bug is identical here); `sameTerms()` collapses to one `offer_id` comparison
because the signed offer *is* the statement of terms; and **invert the settled branch** — ASPG fails
closed with 409 because it stores no response bodies, we store receipts, so a replay returns the
original receipt with `replayed: true`. **That inversion is demo 3.** · `budget/ledger.ts` (keep
append-only + advisory-lock-first + re-read-under-lock; drop the three window keys for one
authorization; extract the duplicated aggregate into one function) · `demo/agent/run.ts` (temp 0.7,
tools over HTTP).

**Skip:** `velocity/window.ts` (dead) · `budget/windows.ts` · `risk/` scoring · `shared/env.ts` ·
`audit/events.ts` · the intent "state machine" (there isn't one — write the 15-line `TRANSITIONS`
map instead) · x402/Algorand · the dashboard · `drizzle-kit push` (use generate + migrate).
