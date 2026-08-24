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
