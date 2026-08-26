// The harness, as something the console can run and render rather than a table in a terminal.
//
// Same fourteen classes, same engine call, no persistence: a demo that wrote 210 decision rows
// every time someone clicked a button would bury the handful of rows that are actually evidence.
import { CLASSES, baseContext, clone } from "@/demo/classes";
import { evaluate } from "@/core/engine/engine";
import type { Outcome } from "@/core/engine/types";
import type { ErrorCode } from "@/core/errors";

export interface GateRow {
  label: string;
  says: string;
  expect: Outcome;
  expectedCode: ErrorCode | null;
  admit: number;
  escalate: number;
  refuse: number;
  matched: number;
  total: number;
  /** What the engine actually said on the first attempt of this class. */
  sample: { code: string | null; message: string; observed?: string; expected?: string } | null;
}

export interface GateReport {
  perClass: number;
  total: number;
  correct: number;
  rows: GateRow[];
  p50Micros: number;
  p95Micros: number;
  maxMicros: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export async function runGate(perClass = 15): Promise<GateReport> {
  const base = await baseContext();
  const rows: GateRow[] = [];
  const micros: number[] = [];
  let correct = 0;

  for (const klass of CLASSES) {
    const row: GateRow = {
      label: klass.label, says: klass.says, expect: klass.expect, expectedCode: klass.code,
      admit: 0, escalate: 0, refuse: 0, matched: 0, total: perClass, sample: null,
    };

    for (let n = 0; n < perClass; n++) {
      const ctx = clone(base);
      klass.mutate(ctx, n);

      const started = process.hrtime.bigint();
      const result = evaluate(ctx);
      micros.push(Number(process.hrtime.bigint() - started) / 1000);

      if (result.outcome === "ADMIT") row.admit++;
      else if (result.outcome === "ESCALATE") row.escalate++;
      else row.refuse++;

      const code = result.reasons[0]?.code ?? null;
      if (result.outcome === klass.expect && code === klass.code) row.matched++;

      if (n === 0) {
        const reason = result.reasons[0];
        row.sample = reason
          ? { code: reason.code, message: reason.message, observed: asText(reason.observed), expected: asText(reason.expected) }
          : { code: null, message: "No rule objected." };
      }
    }

    correct += row.matched;
    rows.push(row);
  }

  const sorted = micros.sort((a, b) => a - b);
  return {
    perClass,
    total: perClass * CLASSES.length,
    correct,
    rows,
    p50Micros: percentile(sorted, 50),
    p95Micros: percentile(sorted, 95),
    maxMicros: sorted.at(-1) ?? 0,
  };
}

/** Reasons carry observed/expected as a string or a list of them. The console renders one line. */
function asText(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(", ") : value;
}
