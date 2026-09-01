@AGENTS.md

# Vouch

A merchant-side **admission and evidence** layer for AI buyers.
Razorpay AI Buildathon, Track 01. Deadline **2026-09-05**. Solo.

> The merchant publishes signed offers. An AI buyer transacts against a Reserve-Pay-shaped
> authorization. A deterministic engine decides **ADMIT / ESCALATE / REFUSE** per transaction.
> Every order emits a **dispute-grade receipt** proving who delegated authority, when, with what
> scope, what parameters were set, and whether the agent stayed inside them.

**The receipt is the product.** Everyone builds a guard; almost nobody builds the proof.

Positioning, and it matters in every design call: *the merchant owns and evidences the risk
decision; Razorpay is the beneficiary of the evidence, never the underwriter of the decision.*

Judged on **Problem taste · Build quality · AI judgment ("the right tool in the right place, and
where you chose not to use one") · Failure recovery.**

Full plan: `../docs/BUILDATHON_BRIEF.md` · Research: `../docs/RAZORPAY_INTEL.md`

---

## Structure

- **Do not scaffold ahead of need.** A folder is created when the *second* file that belongs in it
  is written, never before. No `utils/`, no `helpers/`, no `types/` dumping grounds.
- **One primary axis, others nested inside it.** Layer at the top, feature within. Mixing both axes
  at the same level is the failure mode.
- `app/**` is routing only. A `route.ts` validates input, calls one function, formats the response.
  Nothing else. Enforced by `max-lines: 12`.
- Business logic is plain framework-free async functions taking typed objects and returning typed
  objects — never a `Response`, never an MCP content block. That is what lets an HTTP route, the MCP
  server, a webhook and a script share one implementation.
- Each directory has one responsibility. If you cannot name it in three words, it is wrong.

## Readability

- Names carry the meaning. If a comment explains *what* the code does, rename things instead.
- **Comments explain WHY** — a tradeoff, a non-obvious constraint, a bug this guards against.
- **Keep comments SHORT. One line.** Never a paragraph. Never a block header above every function.
- Functions do one thing. If describing it needs "and", split it.
- No cleverness. The person reading this at 3am is you, on 4 September.

## Money and correctness — non-negotiable

1. Money is `bigint` minor units (**paise**). **No float ever touches a money value.**
2. SQL aggregates cast `::text` and re-parse with `BigInt(String(v))`. The driver must not round.
3. **Balances are derived from an append-only ledger, never stored as a mutable column.** A stored
   balance drifts under concurrency.
4. Every state change writes a row. Nothing is edited in place. Corrections are new rows.
5. The audit record is written **before** the money moves — `await`ed, not fire-and-forget.
6. **Deny by default.** A missing authorization, a missing policy, or *any throw* resolves to REFUSE.
7. Only valid state transitions are allowed, checked in exactly one place.
8. Every money-adjacent write path is idempotent, with a DB unique index as the backstop.
9. **No LLM output ever reaches a decision, a price, or a signature check.**
10. Verify signatures over the **received bytes**, never over a re-serialisation of a parsed object.

## API response envelope — mandatory, no exceptions

**Every** HTTP response from **every** route uses this envelope. No bare objects, no bare arrays.

Success:

```json
{ "status": true, "statusCode": 200, "data": {} }
```

Error:

```json
{
  "status": false,
  "statusCode": 402,
  "message": "Order total ₹12,000.00 exceeds the authorization's remaining ₹9,000.00.",
  "error": {
    "code": "AUTHORIZATION_EXCEEDED",
    "details": { "observed": "1200000", "expected": "900000" }
  }
}
```

| Field | Type | Present when | Notes |
|---|---|---|---|
| `status` | `boolean` | always | `true` on 2xx, `false` on 4xx/5xx |
| `statusCode` | `number` | always | must equal the actual HTTP status |
| `data` | `object \| array \| null` | success | `null` when there is nothing to return |
| `message` | `string` | errors; optional on success | human-readable, safe to show a user |
| `error.code` | `string` | errors | from the error catalogue, SCREAMING_SNAKE_CASE |
| `error.details` | `object` | optional | machine-readable context |

**Never build a `Response` by hand.** Use the helpers — they are the single enforcement point, and
the HTTP status comes from the error catalogue so a handler cannot pair a wrong code with a wrong
status:

```ts
export async function GET() {
  const items = await getCatalog({ agentId });
  return ok({ items, total: items.length });
}

export async function POST() {
  return fail("AUTHORIZATION_EXCEEDED", { observed: "1200000", expected: "900000" });
}
```

**How the three outcomes map:**

| Outcome | HTTP | Envelope | Why |
|---|---|---|---|
| `ADMIT` | 201 | `ok({ order, authorizationUrl })` | The order exists and is awaiting authorization |
| `ESCALATE` | **202** | `ok({ order, paymentLink, reasons })` | Accepted, not refused — a human can complete it. It is not an error |
| `REFUSE` | 402 / 403 / 409 | `fail(code, { observed, expected })` | The agent needs a machine-readable code it can act on |

`details` carries `observed` and `expected` verbatim from the decision's reason, so a client renders
*"you asked for X, the limit is Y"* without a second lookup.

**MCP is not exempt, it is downstream.** The MCP tools call the same functions and serialise the same
result object; the envelope is applied by the HTTP layer only. One implementation, two encodings.

## Enforced boundaries

These are ESLint rules, so violating them fails the build rather than the review:

| Module | Cannot import | Why |
|---|---|---|
| the decision engine | `postgres`, `drizzle-orm`, the db module, **`node:crypto`** | Purity is testable with no DB and no keys. Banning crypto forces "the signature was valid" to arrive as a boolean on the context. |
| the buyer agent | the entire core module | **Enforcement the agent can bypass is not enforcement.** |
| routes and the MCP server | the engine, the db | Both go through the shared function layer. |

## Stack — fixed, do not add

Next 16 (App Router) · React 19 · TypeScript · Tailwind v4 (**CSS-configured in `app/globals.css`,
there is no `tailwind.config`**) · Supabase Postgres · Drizzle · Zod v4 · `ai` + `@ai-sdk/groq`
(buyer agent only) · MCP stdio server · Playwright · Vitest.

Alias is `@/*` → `./*` (repo root). Keep it at one.

**Deliberately absent, and each is a README line:** the Razorpay SDK (plain `fetch`, 3 endpoints) ·
any JWT library (`node:crypto` Ed25519; two-segment token, no `alg` header, so the `alg:none` attack
surface does not exist) · a money formatter (`Intl.NumberFormat("en-IN")`) · `dotenv`
(`tsx --env-file=`) · `date-fns` · any UI kit or chart library · `msw` (drills use real HTTP) ·
a logger · x402, Algorand, or any chain package.

## Two Razorpay facts that shape the code

- **Nothing completes a payment headlessly on a plain test key.** S2S is support-gated and
  PCI-gated; UPI Collect was deprecated 2026-02-28. We create an order plus a payment link, and a
  separate watcher process — **the authorization device** — completes it. That mirrors Reserve Pay
  exactly: the agent never pays; a credential-holding device authorises and the agent spends against
  the block. It is architecture, not a workaround, and `pay` therefore never itself moves money.
- **UPI Reserve Pay's API is public but activation-gated.** Use its documented field names verbatim
  (`single_block_multiple_debit`, `as_presented`, `max_amount`, `expire_at`, `amount_blocked`,
  `amount_debited`). Do not invent a mandate format. Say plainly in the README that live activation
  is support-gated.

## Working rules

- `FAILURES.md` (repo root, so a judge sees it without cloning) is written **as things break**, not reconstructed at the end. The submission
  form's last question is "what broke, and how you got out" — Razorpay says it is the one they read
  first.
- MCP stdio uses **stdout** for the protocol. Every diagnostic goes to `console.error`. One stray
  `console.log` anywhere in the import graph corrupts the stream.
- Gate numbers and settlement numbers are **never** shown in the same number. Two tables, always.
- Never say "first" or "world's first" — the panel built the pilots we would be claiming to precede.
- Non-trivial logic leaves one runnable check behind. Pure logic is tested without a database;
  DB-backed tests self-gate on `DATABASE_URL` and skip cleanly when it is absent.

## Do not build

A charts dashboard · a chat UI as the main interface · a second payment rail · an ML fraud model ·
a 0–100 risk score (a hand-weighted number is the black-box thing this project argues against) ·
auth or multi-tenancy beyond one seeded merchant · a landing page · Docker · CI ·
a `.well-known` discovery manifest · Razorpay's own MCP server anywhere in the money path.
