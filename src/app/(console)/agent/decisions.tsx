"use client";

import type { DecisionSummary } from "@/demo/agent";
import { asMoney } from "../ui";

const TONE = { ADMIT: "text-admit", ESCALATE: "text-escalate", REFUSE: "text-refuse" } as const;

/** What the guard ruled, in the order it ruled it. A refusal never becomes an order, so for some of
 *  these this row is the only trace that the attempt happened at all. */
export function Decisions({ rows }: { rows: DecisionSummary[] }) {
  return (
    <div className="mt-8">
      <div className="label mb-3">what the guard ruled · {rows.length}</div>
      {rows.map((d, i) => (
        <div key={i} className="border-t border-hairline py-3 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={`font-display text-lg ${TONE[d.outcome as keyof typeof TONE]}`}>{d.outcome}</span>
            {d.code && <span className="font-mono text-xs">{d.code}</span>}
            {d.rule && <span className="font-mono text-xs text-fg-3">{d.rule}</span>}
            <span className="ml-auto font-mono text-xs text-fg-3">{d.latencyMs === 0 ? "<1ms" : `${d.latencyMs}ms`}</span>
          </div>
          {d.message && <p className="mt-1 text-sm text-fg-2">{d.message}</p>}
          {d.observed && (
            <p className="mt-1 font-mono text-xs text-fg-3">
              asked {asMoney(d.observed)} · limit {asMoney(d.expected ?? undefined)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
