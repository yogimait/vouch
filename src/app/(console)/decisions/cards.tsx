"use client";

import type { DecisionsOverview } from "@/core/db/queries";
import { Big, BarRow, Figure, HairRow, Note, Quadrant, Spark, StatCard } from "../cards";
import { micros, sourceLabel } from "../format";

/** The total, and the three shares of it, as one object rather than four separate tiles. */
function Ledger({ totals }: { totals: DecisionsOverview["totals"] }) {
  const rows = [
    ["ADMITTED", totals.admit, "ADMIT"],
    ["ESCALATED", totals.escalate, "ESCALATE"],
    ["REFUSED", totals.refuse, "REFUSE"],
  ] as const;

  return (
    <StatCard title="Admission ledger" index={0}>
      <Big value={totals.total} caption="decisions on the record" />
      <div className="mt-4 flex flex-col gap-2">
        {rows.map(([name, n, tone]) => (
          <BarRow key={name} name={name} value={n} of={totals.total} tone={tone} />
        ))}
      </div>
    </StatCard>
  );
}

/** Read off reasons[0] — the engine is first-match, so entry zero is the rule that actually fired. */
function Stops({ reasons }: { reasons: DecisionsOverview["reasons"] }) {
  const top = reasons[0]?.n ?? 0;

  return (
    <StatCard title="What it stops" index={1}>
      {reasons.length === 0 ? (
        <p className="mt-4 text-sm text-fg-3">Nothing has been refused yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {reasons.slice(0, 4).map((r) => (
            <BarRow
              key={r.code}
              name={r.code}
              value={r.n}
              of={top}
              tone={r.escalates ? "ESCALATE" : "REFUSE"}
              mono
              width="min-w-0 flex-1"
            />
          ))}
        </div>
      )}
    </StatCard>
  );
}

function Speed({ p50, p95, recent }: { p50: number | null; p95: number | null; recent: number[] }) {
  return (
    <StatCard title="How fast" index={2}>
      <div className="flex items-start justify-between gap-3">
        <Big value={micros(p50)} tone="ADMIT" />
        <Spark points={recent} className="mt-4" />
      </div>
      <div className="mt-3 flex gap-6">
        <Figure label="p50" value={micros(p50)} />
        <Figure label="p95" value={micros(p95)} />
      </div>
      <Note>
        Conformance-run decisions, timed by the engine alone. A live API admission also pays for two
        database reads, and the two are never reported as one number.
      </Note>
    </StatCard>
  );
}

/** Listed apart, never summed — a scripted violation is not a model's attempt at the same thing. */
function Sources({ sources }: { sources: DecisionsOverview["sources"] }) {
  return (
    <StatCard title="Where from" index={3}>
      <div className="mt-3 flex flex-col">
        {sources.map((s) => (
          <HairRow key={s.source} name={sourceLabel(s.source)} value={s.n} />
        ))}
      </div>
      <Note>Counted apart on purpose; never summed.</Note>
    </StatCard>
  );
}

export function DecisionCards({ overview }: { overview: DecisionsOverview }) {
  return (
    <Quadrant>
      <Ledger totals={overview.totals} />
      <Stops reasons={overview.reasons} />
      <Speed p50={overview.p50Micros} p95={overview.p95Micros} recent={overview.recentLatencyMs} />
      <Sources sources={overview.sources} />
    </Quadrant>
  );
}
