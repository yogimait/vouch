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
//
// The classes themselves live in src/demo/classes.ts, because the console runs the same fourteen.
import { mkdirSync, writeFileSync } from "node:fs";
import { CLASSES, HARNESS_NOW, baseContext, clone } from "@/demo/classes";
import { evaluate } from "@/core/engine/engine";
import type { Outcome } from "@/core/engine/types";
import { recordDecision } from "@/core/decisions";
import type { ErrorCode } from "@/core/errors";

// Read as the first NUMERIC argument, not argv[2]: `npm run harness -- --persist` put the flag
// there, Number("--persist") is NaN, and the run silently produced zero decisions.
const PER_CLASS = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 15);

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
    generatedFrom: HARNESS_NOW.toISOString(), perClass: PER_CLASS, total: attempts.length, correct, attempts,
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
