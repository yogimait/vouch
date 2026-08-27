"use client";

import { useState } from "react";
import type { GateReport, GateRow } from "@/demo/gate";
import { DataTable, type Column } from "@/components/data-table";
import { Outcome, type OutcomeValue } from "../ui";
import { RunButton, Note } from "./panel";
import { cn } from "@/lib/utils";

/** Sub-millisecond is the normal case here. Rendering it as "0ms" reads as a broken timer. */
function micros(v: number): string {
  return v < 1000 ? `${v.toFixed(1)}µs` : `${(v / 1000).toFixed(1)}ms`;
}

const COLUMNS: Column<GateRow>[] = [
  { header: "Condition", cell: (r) => <span className="font-mono text-xs">{r.label}</span> },
  {
    header: "What it is",
    wrap: true,
    className: "text-fg-2",
    cell: (r) => (
      <>
        {r.says}
        {r.sample?.code && (
          <div className="mt-1 text-xs text-fg-3">
            <span className="font-mono text-refuse">{r.sample.code}</span> — {r.sample.message}
          </div>
        )}
      </>
    ),
  },
  { header: "Verdict", cell: (r) => <Outcome value={r.expect as OutcomeValue} /> },
  {
    header: "Matched",
    align: "right",
    cell: (r) => (
      <span className={cn("font-mono text-xs", r.matched === r.total ? "text-fg-3" : "text-refuse")}>
        {r.matched}/{r.total}
      </span>
    ),
  },
];

export function GatePanel() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<GateReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // try/finally, not a trailing setBusy: a throw used to leave the button disabled until a reload.
  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/demo/gate", { method: "POST" });
      const body = await res.json();
      if (body.data) setReport(body.data);
      else setError(body.error?.code ?? body.message ?? "the run was refused");
    } catch {
      setError("the request never reached the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <RunButton onClick={run} busy={busy}>Run all fourteen</RunButton>
        <span className="text-sm text-fg-3">14 conditions × 15 attempts, straight into the engine</span>
      </div>

      {error && <p className="mt-4 font-mono text-xs text-refuse">{error}</p>}

      {report && (
        <div className="mt-8">
          <div className="mb-5 flex flex-wrap gap-8 border-b border-hairline pb-4">
            <Figure label="decisions" value={String(report.total)} />
            <Figure
              label="classified exactly"
              value={`${report.correct}/${report.total}`}
              tone={report.correct === report.total ? "text-admit" : "text-refuse"}
            />
            <Figure label="p50" value={micros(report.p50Micros)} />
            <Figure label="p95" value={micros(report.p95Micros)} />
          </div>

          <DataTable columns={COLUMNS} rows={report.rows} rowKey={(r) => r.label} empty={null} />

          <Note>
            No Razorpay call and no model call on this path — it calls the pure engine directly. Nothing
            here is written to the decisions log, so these numbers can never be mistaken for settled money.
          </Note>
        </div>
      )}
    </>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={cn("font-display text-2xl", tone)}>{value}</div>
    </div>
  );
}
