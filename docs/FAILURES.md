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
