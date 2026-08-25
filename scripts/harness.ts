// The gate harness: 14 labelled violation classes, 15 attempts each, 210 decisions.
//
//   npm run harness [perClass]
//
// **Zero Razorpay calls and zero LLM calls, by construction rather than by discipline.** It drives
// evaluate() directly. pay() would reach the gateway on both ADMIT and ESCALATE, so a harness built
// on pay() could not honestly claim either number.
//
// What this measures is the gate, and only the gate. Settlement numbers come from `npm run settle`
// and live in a different table. They are never added together.
import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { authorizations, buyerAgents, catalogItems } from "@/core/db/schema";
import { evaluate } from "@/core/engine/engine";
import type { AdmissionContext, Outcome } from "@/core/engine/types";
import { recordDecision } from "@/core/decisions";
import type { ErrorCode } from "@/core/errors";

const PER_CLASS = Number(process.argv[2] ?? 15);
const NOW = new Date("2026-08-25T12:00:00.000Z");

interface Klass {
  label: string;
  expect: Outcome;
  code: ErrorCode | null;
  mutate: (ctx: AdmissionContext, n: number) => void;
}

// One mutation each, applied to a context on which every rule otherwise passes. A test that changes
// two things at once cannot tell you which one fired.
const CLASSES: Klass[] = [
  { label: "clean", expect: "ADMIT", code: null, mutate: () => {} },

  { label: "agent_frozen", expect: "REFUSE", code: "AGENT_FROZEN",
    mutate: (c) => { c.agent.status = "FROZEN"; } },

  { label: "offer_signature_invalid", expect: "REFUSE", code: "OFFER_SIGNATURE_INVALID",
    mutate: (c) => { c.offer!.signatureValid = false; } },

  { label: "offer_expired", expect: "REFUSE", code: "OFFER_EXPIRED",
    mutate: (c, n) => { c.offer!.expiresAt = new Date(c.now.getTime() - (n + 1) * 1000); } },

  { label: "offer_wrong_agent", expect: "REFUSE", code: "OFFER_WRONG_AGENT",
    mutate: (c, n) => { c.offer!.agentId = `agt_OTHER_${n}`; } },

  { label: "offer_replayed", expect: "REFUSE", code: "OFFER_ALREADY_USED",
    mutate: (c, n) => { c.offer!.consumedAt = new Date(c.now.getTime() - n * 60_000); } },

  { label: "misquote", expect: "REFUSE", code: "MISQUOTE",
    mutate: (c, n) => { c.claimedTotalPaise = c.offer!.totalPaise - BigInt((n + 1) * 100); } },

  { label: "authorization_not_confirmed", expect: "REFUSE", code: "AUTHORIZATION_NOT_CONFIRMED",
    mutate: (c, n) => { c.authorization!.status = n % 2 === 0 ? "initiated" : "rejected"; } },

  { label: "authorization_expired", expect: "REFUSE", code: "AUTHORIZATION_EXPIRED",
    mutate: (c, n) => { c.authorization!.expireAt = new Date(c.now.getTime() - (n + 1) * 3600_000); } },

  { label: "sku_out_of_scope", expect: "REFUSE", code: "SKU_NOT_AUTHORIZED",
    mutate: (c) => { c.offer!.category = "furniture"; } },

  { label: "per_order_cap", expect: "ESCALATE", code: "PER_ORDER_LIMIT_EXCEEDED",
    mutate: (c, n) => { c.offer!.totalPaise = c.authorization!.maxPerOrderPaise + BigInt((n + 1) * 100_00); } },

  { label: "headroom_exceeded", expect: "ESCALATE", code: "AUTHORIZATION_EXCEEDED",
    mutate: (c, n) => {
      // Under the per-order cap so the earlier rule cannot claim this one's credit.
      c.offer!.totalPaise = c.authorization!.maxPerOrderPaise;
      c.authorization!.debitedPaise = c.authorization!.maxAmountPaise - BigInt(n * 10_00);
    } },

  { label: "velocity", expect: "REFUSE", code: "VELOCITY_EXCEEDED",
    mutate: (c, n) => { c.ordersLastHour = c.authorization!.maxOrdersPerHour + n; } },

  { label: "out_of_stock", expect: "REFUSE", code: "OUT_OF_STOCK",
    mutate: (c, n) => { c.offer!.qty = c.inventory + 1 + n; } },
];

interface Attempt {
  label: string;
  expectedOutcome: Outcome;
  expectedCode: ErrorCode | null;
  outcome: Outcome;
  code: ErrorCode | null;
  micros: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function baseContext(): Promise<AdmissionContext> {
  const db = getDb();
  const [agent] = await db.select().from(buyerAgents).where(eq(buyerAgents.status, "ACTIVE")).limit(1);
  const [auth] = await db.select().from(authorizations).where(eq(authorizations.status, "confirmed")).limit(1);
  const [item] = await db.select().from(catalogItems).where(eq(catalogItems.sku, "SKU-A")).limit(1);
  if (!agent || !auth || !item) throw new Error("Run `npm run db:seed` first.");

  return {
    now: NOW,
    agent: { id: agent.id, status: agent.status },
    offer: {
      id: "off_HARNESS", agentId: agent.id, authorizationId: auth.id,
      sku: item.sku, category: item.category, qty: 1,
      unitPricePaise: item.listPricePaise, totalPaise: item.listPricePaise,
      expiresAt: new Date(NOW.getTime() + 120_000), signatureValid: true, consumedAt: null,
    },
    authorization: {
      id: auth.id, status: auth.status,
      maxAmountPaise: auth.maxAmountPaise, maxPerOrderPaise: auth.maxPerOrderPaise,
      maxOrdersPerHour: auth.maxOrdersPerHour,
      allowedCategories: auth.allowedCategories, allowedSkus: auth.allowedSkus,
      expireAt: auth.expireAt, debitedPaise: 0n, heldPaise: 0n,
    },
    claimedTotalPaise: null,
    ordersLastHour: 0,
    inventory: item.inventory,
    policySnapshot: { authorizationId: auth.id },
    policyVersion: 1,
  };
}

// Structured clone would carry the Dates but not the bigints in older runtimes, so the copy is
// explicit. Every attempt must start from an identical context or the run is not reproducible.
function clone(base: AdmissionContext): AdmissionContext {
  return {
    ...base,
    agent: { ...base.agent },
    offer: { ...base.offer! },
    authorization: { ...base.authorization! },
  };
}

async function main(): Promise<void> {
  const base = await baseContext();
  const attempts: Attempt[] = [];

  for (const klass of CLASSES) {
    for (let n = 0; n < PER_CLASS; n++) {
      const ctx = clone(base);
      klass.mutate(ctx, n);

      const started = process.hrtime.bigint();
      const result = evaluate(ctx);
      const micros = Number(process.hrtime.bigint() - started) / 1000;

      attempts.push({
        label: klass.label,
        expectedOutcome: klass.expect,
        expectedCode: klass.code,
        outcome: result.outcome,
        code: result.reasons[0]?.code ?? null,
        micros,
      });
    }
  }

  const byLabel = new Map<string, Attempt[]>();
  for (const a of attempts) byLabel.set(a.label, [...(byLabel.get(a.label) ?? []), a]);

  console.log(`\n  ${attempts.length} gate decisions — no Razorpay calls, no LLM calls\n`);
  console.log(`  ${"label".padEnd(28)}${"expected".padEnd(10)}${"ADMIT".padStart(7)}${"ESC".padStart(6)}${"REFUSE".padStart(8)}   code match`);
  console.log(`  ${"-".repeat(78)}`);

  let correct = 0;
  for (const klass of CLASSES) {
    const rows = byLabel.get(klass.label)!;
    const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
    const matched = rows.filter((r) => r.outcome === klass.expect && r.code === klass.code).length;
    correct += matched;

    const flag = matched === rows.length ? "" : "   <-- MISMATCH";
    console.log(
      `  ${klass.label.padEnd(28)}${klass.expect.padEnd(10)}`
      + `${String(count("ADMIT")).padStart(7)}${String(count("ESCALATE")).padStart(6)}${String(count("REFUSE")).padStart(8)}`
      + `   ${matched}/${rows.length}${flag}`,
    );
  }

  const sorted = attempts.map((a) => a.micros).sort((x, y) => x - y);
  console.log(`  ${"-".repeat(78)}`);
  console.log(`  exact classification: ${correct}/${attempts.length}`);
  console.log(`  latency  p50 ${percentile(sorted, 50).toFixed(1)}us   p95 ${percentile(sorted, 95).toFixed(1)}us   max ${sorted.at(-1)!.toFixed(1)}us`);
  // Deliberately not priced against Thirdwatch: I have no verified figure for it, and inventing a
  // per-decision cost would be the one number in this report nobody could check.
  console.log(`  cost: engine-only, no network on this path — see docs for why it is not priced\n`);

  mkdirSync("evidence", { recursive: true });
  writeFileSync("evidence/harness.json", JSON.stringify({
    generatedFrom: NOW.toISOString(), perClass: PER_CLASS, total: attempts.length, correct, attempts,
  }, null, 2));
  console.log(`  written to evidence/harness.json`);

  if (process.argv.includes("--persist")) {
    console.log(`  writing ${attempts.length} decision rows with source='harness'...`);
    for (const [i, a] of attempts.entries()) {
      const ctx = clone(base);
      CLASSES.find((k) => k.label === a.label)!.mutate(ctx, i % PER_CLASS);
      const result = evaluate(ctx);
      // Rounds to 0 for a 2us decision, and the console renders that as "<1ms". Clamping it to 1
      // would overstate the engine by roughly 500x in the one place anyone reads a latency.
      result.latencyMs = Math.round(a.micros / 1000);
      await recordDecision({
        agentId: base.agent.id, source: "harness", label: a.label, result,
        authorizationId: base.authorization!.id, policySnapshot: base.policySnapshot,
      });
    }
    console.log(`  persisted. They are labelled 'harness' and are never counted with 'llm' rows.`);
  }

  if (correct !== attempts.length) {
    console.log(`\n  ${attempts.length - correct} attempts did not classify as expected.\n`);
    process.exit(1);
  }
  console.log();
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
