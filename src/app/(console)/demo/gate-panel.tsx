"use client";

import { useState } from "react";
import type { GateReport } from "@/demo/gate";
import { Button, Note } from "./panel";

const OUTCOME = { ADMIT: "text-admit", ESCALATE: "text-escalate", REFUSE: "text-refuse" } as const;

/** Sub-millisecond is the normal case here. Rendering it as "0ms" reads as a broken timer. */
function micros(v: number): string {
  return v < 1000 ? `${v.toFixed(1)}µs` : `${(v / 1000).toFixed(1)}ms`;
}

export function GatePanel() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<GateReport | null>(null);

  async function run() {
    setBusy(true);
    const res = await fetch("/api/demo/gate", { method: "POST" });
    setReport((await res.json()).data ?? null);
    setBusy(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={run} busy={busy}>Run all fourteen</Button>
        <span className="text-sm text-fg-3">14 conditions × 15 attempts, straight into the engine</span>
      </div>

      {report && (
        <div className="mt-8">
          <div className="mb-5 flex flex-wrap gap-8 border-b border-hairline pb-4">
            <div><div className="label">decisions</div><div className="font-display text-2xl">{report.total}</div></div>
            <div>
              <div className="label">classified exactly</div>
              <div className={`font-display text-2xl ${report.correct === report.total ? "text-admit" : "text-refuse"}`}>
                {report.correct}/{report.total}
              </div>
            </div>
            <div><div className="label">p50</div><div className="font-display text-2xl">{micros(report.p50Micros)}</div></div>
            <div><div className="label">p95</div><div className="font-display text-2xl">{micros(report.p95Micros)}</div></div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["Condition", "What it is", "Verdict", "Matched"].map((h) => (
                  <th key={h} className="label py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.label} className="border-b border-hairline align-top">
                  <td className="py-3 pr-4 font-mono text-xs">{r.label}</td>
                  <td className="py-3 pr-4 text-fg-2">
                    {r.says}
                    {r.sample?.code && (
                      <div className="mt-1 text-xs text-fg-3">
                        <span className="font-mono text-refuse">{r.sample.code}</span> — {r.sample.message}
                      </div>
                    )}
                  </td>
                  <td className={`py-3 pr-4 font-mono text-xs ${OUTCOME[r.expect]}`}>{r.expect}</td>
                  <td className={`py-3 font-mono text-xs ${r.matched === r.total ? "text-fg-3" : "text-refuse"}`}>
                    {r.matched}/{r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Note>
            No Razorpay call and no model call on this path — it calls the pure engine directly. Nothing
            here is written to the decisions log, so these numbers can never be mistaken for settled money.
          </Note>
        </div>
      )}
    </>
  );
}
