# What broke, and how I got out

Written as things break, not reconstructed at the end.

Format per entry: **what I expected · what actually happened · the evidence · what I changed · what
it cost.** Dead ends are kept, not deleted — a dead end that was correctly abandoned is still
engineering.

---

## Open questions carried into the build

| # | Question | Status |
|---|---|---|
| 1 | Can a payment be completed headlessly on a plain `rzp_test_` key? Which of {Payment Link page, Standard Checkout} × {test UPI, test card} actually works? | **Day-0 gate. Unresolved.** |
| 2 | Can the webhook reach localhost, or is a tunnel needed? | Unresolved |
| 3 | Will UPI Reserve Pay be activated on a student test account? | Ticket to be filed day 0. Expected: no. |

---

<!-- Entries below, newest last. -->

## 2026-08-24 · Scripts wouldn't run: top-level await in a CJS project

**Expected** `npx tsx scripts/probe.ts` to just work.

**Happened** Five identical errors:

```
ERROR: Top-level await is currently not supported with the "cjs" output format
```

`create-next-app` does not set `"type"` in `package.json`, so Node treats `.ts` as CommonJS and tsx
compiles to CJS. Every script in this project is a top-level-await script.

**Options** (a) rename every script to `.mts` — per-file, zero blast radius, but ugly and it spreads
to the MCP server; (b) set `"type": "module"` — one line, but changes module resolution for the whole
project including the Next build.

**Changed** Took (b), and verified it rather than assuming: `npm run build` still compiles clean on
Next 16.3.2 with Turbopack, static generation included. `.mjs` configs are unaffected either way.

**Cost** ~10 minutes. Worth knowing before day 1 rather than during the first real script.

## 2026-08-24 · Playwright browser revision mismatch

`playwright@1.62.1` wants `chromium-1234`; the machine had `chromium-1228` cached from another
project. `npx playwright install chromium` pulled 114 MB. Headless launch then verified against
example.com before trusting it.

Noting it because the plan assumed the cache was already correct — it wasn't, and finding that on
day 9 instead of day 0 would have cost a demo.

## 2026-08-24 · Dev-only audit findings left unfixed

`npm audit` reports 4 moderate in `drizzle-kit` → `@esbuild-kit/*` → `esbuild`.
`npm audit --omit=dev` reports **0**. The fix is `--force`, which downgrades/breaks `drizzle-kit`.
Left as-is deliberately: dev-only, CLI-only, and the esbuild advisory concerns its dev server, which
we never run.

## 2026-08-24 · tsconfig targeted ES2017, so BigInt literals did not compile

**Expected** `npm run typecheck` clean after writing `core/money.ts`.

**Happened** 20 errors, all the same:

```
error TS2737: BigInt literals are not available when targeting lower than ES2020.
```

`create-next-app` writes `"target": "ES2017"`. This project's single hardest rule is that money is
`bigint` paise and no float ever touches it — so the default target forbids the one thing the design
depends on. It compiled fine at runtime (esbuild and SWC don't care), which is worse: the rule would
have been silently unenforceable in the editor while looking correct.

**Changed** `"target": "ES2022"`.

**Cost** ~5 minutes, and then another 10 on the next entry.

## 2026-08-24 · Typecheck kept failing after the fix — stale incremental cache

After bumping the target, `npm run typecheck` still reported the same ES2017 errors. The file was
correct; `grep` confirmed `"target": "ES2022"` on line 3.

Cause: `"incremental": true` plus a `tsconfig.tsbuildinfo` written under the old target. `tsc` trusted
the cache. `rm tsconfig.tsbuildinfo` and it passed clean.

Kept here because the symptom actively lies — the config is right, the tool says it is wrong, and the
instinct is to keep editing the config.

## 2026-08-24 · Boundary lint proved rather than assumed

Wrote a throwaway `core/engine/_boundary_probe.ts` importing both `@/core/db` and `node:crypto`, ran
eslint, confirmed **two** errors fired, deleted it. An architectural rule nobody has seen fail is a
rule you do not know you have.

## 2026-08-24 · `drizzle-kit migrate` exited 0 without applying anything

**Expected** `npm run db:migrate` to create 12 tables.

**Happened** It printed `Using 'postgres' driver for database querying` and exited **0**. No tables
were created. `db:seed` then failed with `relation "audit_log" does not exist`, which looked like a
seed bug and was not.

**Root cause, two layers.**

1. `DIRECT_URL` pointed at `aws-0-ap-south-1.db.supabase.co`, which **does not resolve**
   (`ENOTFOUND`). Supabase's Connect panel shows a pooled host of the form
   `aws-0-<region>.pooler.supabase.com`, and it is easy to produce that direct-looking hostname by
   editing it. The real direct host is `db.<project-ref>.supabase.co` — and on this project **that
   does not resolve either**, so the true direct connection is simply unavailable here.
2. **`drizzle-kit migrate` swallowed the DNS failure and reported success.** That is the expensive
   part. A migration step that cannot fail loudly cannot be trusted, and "runs from a clean clone"
   is definition-of-done #1.

**Verified before changing anything** — probed both candidates directly:

```
session pooler  aws-0-ap-south-1.pooler.supabase.com:5432   WORKS
true direct     db.<ref>.supabase.co:5432                   ENOTFOUND
```

**Changed**
- `DIRECT_URL` now uses the **session pooler** (pooler host, port 5432). It speaks the full protocol
  and runs DDL; only the *transaction* pooler on 6543 cannot.
- Replaced `drizzle-kit migrate` with `scripts/migrate.ts` using drizzle-orm's own migrator, which
  **throws**. It also refuses outright to run against port 6543.
- Suppressed the driver's `NOTICE` output so a second run is clean rather than looking like errors.

**Cost** ~25 minutes, most of it spent believing the seed was broken.

## 2026-08-24 · My own db:check passed while the thing it checked was broken

`db:check` validated ports and printed hostnames, then connected using **`DATABASE_URL` only**. So it
reported green while `DIRECT_URL` pointed at a host that did not exist.

A check that does not exercise the thing it is checking is not a check — it is a comment that runs.
It now opens a real connection with `DIRECT_URL` too, and translates `ENOTFOUND` into the actual
advice (use the session pooler).

## 2026-08-25 · The day-0 gate: six wrong assumptions before a payment captured

The gate is the one task that could have invalidated the whole plan, and every layer of it was
different from what the docs implied. Each line below is a separate failed run.

| # | Assumption | Reality | How it surfaced |
|---|---|---|---|
| 1 | `page.evaluate(fn)` works under `tsx` | `ReferenceError: __name is not defined` — esbuild's `keepNames` injects a helper into the function source, which is then serialised and shipped to a browser that has never heard of it | Passed the expression as a **string**; a string is never transpiled |
| 2 | The payment link page is the page | It is a shell. The entire checkout is an iframe on `api.razorpay.com/v1/checkout/public` — 0 inputs at the top level | Resolve the frame whose URL contains `/checkout/`, drive that |
| 3 | Checkout opens on payment methods | Checkout **v2** opens on a contact gate. No method is visible until a mobile number is accepted | Walk the screens, dumping each one |
| 4 | `fill()` sets a form value | *"Please enter a valid mobile number."* The validator listens per keystroke, so a programmatic set leaves it in an invalid state | `pressSequentially` with a delay |
| 5 | Test UPI (`success@razorpay`) is available | `GET /v1/preferences` → **`upi: false`**, `upi_type: {collect:0, intent:0}`. UPI is not enabled on this account, so the documented test VPAs are unreachable on *any* page | Card instead |
| 6 | `4111 1111 1111 1111` is *the* test card | *"this business accepts domestic (Indian) card payments only."* That BIN is international | Domestic test card `5267 3181 8797 5449` |

Two more sat behind those: a **"save your card?"** interstitial blocks the submit until dismissed,
and the final step is not a bank 3DS page at all but **Razorpay's own OTP screen**, whose submit
button carries no accessible name — `getByRole("button", {name:/continue/i})` times out against it.
Submitting with **Enter** works.

**The two things that actually mattered**

`GET /v1/preferences?key_id=…` is public and reports exactly which methods the account has. Reading
it first would have skipped runs 5 and the UPI work entirely.

`GET /v1/payments` gives the real reason. The browser sat on *"Confirming Payment"* forever with
nothing in the DOM to read; the API said *"domestic card payments only"* in plain words. **When a
hosted page goes quiet, ask the API what it thinks happened** — the UI is not where the error is.

**Result**

```
pay_TThvnSZb9n3zRv   captured   card   ₹100.00   headless, no human
```

**Cost** ~50 minutes, ten runs. Worth every minute: the gate is the assumption the plan is built on,
and five of its six failure modes were invisible from the documentation.

## 2026-08-25 · One strict env parse failed a path that does not use the variable

`env()` parses every variable in one `safeParse`. `RAZORPAY_WEBHOOK_SECRET` was `min(1)` and the
`.env.local` value was empty, so **order creation** threw — a path that has nothing to do with
webhooks. Inside `pay()` that surfaced as `GATEWAY_UNAVAILABLE`, which points at Razorpay.

Razorpay was fine. Creating the same order with `curl` returned `200`.

The secret is now `optional()`, and `verifyWebhookSignature` returns `false` when it is absent —
no secret configured means nothing can be trusted, so nothing is. A missing secret must never read
as "skip verification".

**Cost** ~10 minutes. Worth naming because the error message actively pointed away from the cause:
an aggregated validator turns "one unrelated value is unset" into "the payment gateway is down".

## 2026-08-25 · A gateway failure silently ate the agent's headroom

Found by running the orchestrator rather than by reading it. Three attempts against a ₹9,000
authorization left it showing:

```
debited ₹0.00   held ₹7,000.00   available ₹2,000.00
```

`pay()` reserved, then called the gateway, and on failure set the order to `FAILED` — without
releasing the hold. Every gateway outage would have permanently shrunk what the agent could spend,
with no debit anywhere to explain it. Two failed orders were enough to consume 78% of the
authorization.

`gatewayFailed` now releases. The ESCALATE path never reserves, so release is a no-op there.

The regression test forces a **real 401 from Razorpay** with a wrong secret rather than mocking
`fetch` — a mocked failure proves the test's idea of failure, not the gateway's. It also asserts the
split the whole project argues for: the **decision stays `ADMIT`** while the **order goes `FAILED`**.
The gate said yes; the settlement did not happen. Those are different numbers and they live in
different tables.

## 2026-08-25 · Settling started issuing receipts, and a test teardown deleted the order first

`receipts.order_id` references `orders.id`. The webhook test's `afterAll` predated receipts, so the
moment settlement began issuing one, teardown hit:

```
Key (id)=(ord_WH1787656369246) is still referenced from table "receipts"
```

Every assertion passed — **96 tests green, one file red**. The failure was entirely in cleanup, which
is the kind that looks alarming and means nothing, and the kind that leaves rows behind. Both were
true: the stale order had to be deleted by hand before the suite was clean again.

Teardown now deletes receipts first. Worth noting because adding a write to a shared code path
silently made an unrelated test's cleanup wrong — the foreign key caught it, which is the argument
for having the foreign key.
