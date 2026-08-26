import type { ClassCount, MetricsOverview, SettlementSnapshot, SourceClock } from "@/core/db/overview/metrics";
import { CLASSES } from "@/demo/classes";
import { formatInr } from "@/core/money";
import { Big, BarRow, Figure, HairRow, Note, Quadrant, StatCard } from "../cards";
import { micros, pct, type Tone } from "../format";

// A server component on purpose: money is bigint here, and a bigint cannot cross into a client prop.

const STATES = [
  ["PAID", "paid", "ADMIT"],
  ["ADMITTED", "admitted", "neutral"],
  ["AWAITING_AUTHORIZATION", "awaitingAuthorization", "neutral"],
  ["ESCALATED", "escalated", "ESCALATE"],
  ["FAILED", "failed", "REFUSE"],
  ["EXPIRED", "expired", "REFUSE"],
] as const;

/** Whichever outcome the class produced most. A class is named by what it does, not what it hoped. */
function dominant(c: ClassCount): Tone {
  if (c.refused >= c.escalated && c.refused >= c.admitted) return "REFUSE";
  return c.escalated >= c.admitted ? "ESCALATE" : "ADMIT";
}

function Classes({ classes }: { classes: ClassCount[] }) {
  const top = classes[0]?.n ?? 0;

  return (
    <StatCard title="The gate · classes proven" index={0}>
      {classes.length === 0 ? (
        <>
          <Big value="not run yet" caption={`${CLASSES.length} classes declared, none exercised`} />
          <Note>
            These rows exist only after <span className="font-mono">npm run harness</span>. Clicking
            through the demo writes decisions, but not labelled ones, so this is not a zero — it is
            an unmeasured card.
          </Note>
        </>
      ) : (
        <>
          <Big value={classes.length} caption={`of ${CLASSES.length} declared`} />
          <div className="mt-4 flex flex-col gap-2">
            {classes.slice(0, 5).map((c) => (
              <BarRow key={c.label} name={c.label} value={c.n} of={top} tone={dominant(c)} mono width="min-w-0 flex-1" />
            ))}
          </div>
          <Note>
            One denominator: the {CLASSES.length} classes declared in{" "}
            <span className="font-mono">src/demo/classes.ts</span> — {CLASSES.length - 1} violations plus the
            clean control that must be admitted. Not the engine&rsquo;s rule count, which is a
            different number counting a different thing.
          </Note>
        </>
      )}
    </StatCard>
  );
}

function Clocks({ sources }: { sources: SourceClock[] }) {
  return (
    <StatCard title="The gate · two clocks" index={1}>
      {sources.length === 0 ? (
        <p className="mt-4 text-sm text-fg-3">No decisions recorded yet.</p>
      ) : (
        <div className="mt-3 flex flex-col">
          {sources.map((s) => (
            <HairRow key={s.source} name={s.source} value={`${s.n} · ${micros(s.p50Micros)} · ${micros(s.p95Micros)}`} />
          ))}
        </div>
      )}
      <Note>
        Count, p50, p95 — listed apart and never summed. The clocks are not comparable:{" "}
        <span className="font-mono">harness</span> times the engine alone, while{" "}
        <span className="font-mono">http</span> times a full admission including the database reads
        that assemble its context.
      </Note>
    </StatCard>
  );
}

function Settled({ settlement }: { settlement: SettlementSnapshot }) {
  const { reservedPaise, debitedPaise, heldPaise, releasedPaise, paidPaise } = settlement;
  const gap = paidPaise - debitedPaise;

  // One rail, three parts of one whole. BarRow prints its value as a count, and paise is not a count.
  const parts = [
    ["debited", debitedPaise, "var(--admit)"],
    ["held", heldPaise, "var(--escalate)"],
    ["released", releasedPaise, "rgba(255,255,255,0.28)"],
  ] as const;

  return (
    <StatCard title="Settlement · money that moved" index={2}>
      {reservedPaise === 0n ? (
        <>
          <Big value="nothing reserved" caption="the authorization ledger is empty" />
          <Note>Money, not decisions. The two cards to its left count admission decisions and share no denominator with this one.</Note>
        </>
      ) : (
        <>
          <Big value={formatInr(debitedPaise)} caption="debited against mandates" />
          <span className="mt-4 flex h-[3px] overflow-hidden rounded-[1px] bg-white/5">
            {parts.map(([name, v, fill]) => (
              <span key={name} className="block h-full" style={{ width: pct(Number(v), Number(reservedPaise)), background: fill }} />
            ))}
          </span>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {parts.map(([name, v]) => <Figure key={name} label={name} value={formatInr(v)} />)}
          </div>
          <Note>
            Measured against {formatInr(reservedPaise)} reserved. PAID orders total{" "}
            {formatInr(paidPaise)}, which the ledger&rsquo;s COMMIT total{" "}
            {gap === 0n ? "matches exactly" : `misses by ${formatInr(gap < 0n ? -gap : gap)}`}. Money,
            not decisions — the cards to its left count neither.
          </Note>
        </>
      )}
    </StatCard>
  );
}

function Evidence({ settlement }: { settlement: SettlementSnapshot }) {
  return (
    <StatCard title="Settlement · orders and their evidence" index={3}>
      {settlement.orders === 0 ? (
        <>
          <Big value="no orders" caption="nothing has reached settlement" />
          <Note>A refusal writes a decision and no order, so an empty table here is not an idle gate.</Note>
        </>
      ) : (
        <>
          {/* "0 / 0" is a ratio with no denominator, and reads as a failure rather than as nothing settled. */}
          {settlement.paid === 0 ? (
            <Big value="none settled" caption="no PAID order, so no receipt is owed" />
          ) : (
            <Big value={`${settlement.receipts} / ${settlement.paid}`} caption="receipts per PAID order" />
          )}
          <div className="mt-4 flex flex-col gap-2">
            {STATES.map(([name, key, tone]) => (
              <BarRow key={name} name={name} value={settlement[key]} of={settlement.orders} tone={tone} mono width="min-w-0 flex-1" />
            ))}
          </div>
          <Note>All six order states, against {settlement.orders} orders on the record.</Note>
        </>
      )}
    </StatCard>
  );
}

export function MetricCards({ overview }: { overview: MetricsOverview }) {
  return (
    <Quadrant>
      <Classes classes={overview.classes} />
      <Clocks sources={overview.sources} />
      <Settled settlement={overview.settlement} />
      <Evidence settlement={overview.settlement} />
    </Quadrant>
  );
}
