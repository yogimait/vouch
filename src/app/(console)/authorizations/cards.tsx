"use client";

import type { AuthorizationsOverview, MandateRow } from "@/core/db/overview/authorizations";
import { formatInr } from "@/core/money";
import { cn } from "@/lib/utils";
import { BarRow, Big, Figure, Note, Quadrant, StatCard } from "../cards";
import { pct, TONE } from "../format";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Bigint first, Number after: the ratio is layout, and no float ever touches the money value. */
const share = (part: bigint, whole: bigint) =>
  pct(whole <= 0n ? 0 : Number((part * 10000n) / whole), 10000);

/**
 * BarRow's value slot is a 2rem count column, so it cannot carry a rupee figure. This is the same
 * row with formatInr on the right and each mandate measured against its own ceiling.
 */
function MandateBar({ m }: { m: MandateRow }) {
  const frozen = m.agentStatus === "FROZEN";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("truncate text-[10px] tracking-[0.06em]", frozen ? "text-fg-3" : "text-fg-2")} title={m.principalRef}>
          {m.agentName}
        </span>
        <span className={cn("shrink-0 font-mono text-xs tabular-nums", frozen ? "text-fg-3" : "text-fg")}>
          {formatInr(m.availablePaise)}
        </span>
      </div>
      <span className="mt-1 block h-[3px] overflow-hidden rounded-[1px] bg-white/5">
        <span
          className="block h-full"
          style={{
            width: share(m.availablePaise, m.maxAmountPaise),
            background: frozen ? "rgba(255,255,255,0.16)" : TONE.ADMIT.fill,
          }}
        />
      </span>
      <p className="mt-1 text-[10px] leading-snug text-fg-3">
        {frozen ? `unspendable — ${m.frozenReason ?? "the agent is frozen"}` : `of ${formatInr(m.maxAmountPaise)}`}
      </p>
    </div>
  );
}

function Live({ overview }: { overview: AuthorizationsOverview }) {
  return (
    <StatCard title="Live mandates" index={0}>
      <Big value={overview.live} caption={`granted by ${plural(overview.principals, "principal")}`} />
      <div className="mt-4 flex flex-col gap-3">
        {overview.mandates.map((m) => (
          <MandateBar key={m.id} m={m} />
        ))}
      </div>
      <Note>
        Each bar is headroom against its own ceiling. Two people delegated these, so the ceilings are
        never added together — and a mandate held by a frozen agent is listed, not counted.
      </Note>
    </StatCard>
  );
}

function Reach({ overview }: { overview: AuthorizationsOverview }) {
  return (
    <StatCard title="Reach" index={1}>
      <Big value={overview.catalogActive} caption="active SKUs in the catalog" />
      <div className="mt-4 flex flex-col gap-2">
        {overview.mandates.map((m) => (
          <BarRow
            key={m.id}
            name={`${m.agentName} · ${m.scopedBy === "sku" ? "SKU list" : "categories"}`}
            value={m.reachSkus}
            of={overview.catalogActive}
            width="min-w-0 flex-1"
          />
        ))}
      </div>
      <Note>
        Resolved the way the engine resolves it: a non-empty allowed_skus list is the tighter grant
        and replaces the categories outright, so scoping by SKU narrows this rather than widening it.
      </Note>
    </StatCard>
  );
}

/** Expiry is the only ceiling here that can go bad on its own, so it is the only one that colours. */
function Ceilings({ mandates }: { mandates: MandateRow[] }) {
  return (
    <StatCard title="The ceilings" index={2}>
      <div className="mt-3 flex flex-col">
        {mandates.map((m) => {
          const dead = m.daysToExpiry <= 0 || m.status === "expired" || m.status === "rejected";
          const life = m.status === "rejected" ? "rejected" : dead ? "expired" : `${m.daysToExpiry}d`;
          return (
            <div key={m.id} className="border-b border-hairline py-2.5 first:pt-0 last:border-b-0">
              <div className="font-mono text-[11px] text-fg-2">{m.agentName}</div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <Figure label="per order" value={formatInr(m.maxPerOrderPaise)} />
                <Figure label="per hour" value={String(m.maxOrdersPerHour)} />
                <Figure label="expires" value={life} tone={dead ? "text-refuse" : undefined} />
              </div>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
}

function Gate({ reasons }: { reasons: AuthorizationsOverview["reasons"] }) {
  const top = reasons[0]?.n ?? 0;

  return (
    <StatCard title="THE GATE · what the mandate refused" index={3}>
      {reasons.length === 0 ? (
        <p className="mt-4 text-sm text-fg-3">No mandate rule has fired yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {reasons.map((r) => (
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
      <Note>
        This card counts decisions; the other three count rupees. They are never one figure. Counted
        by the rule that fired, not by the mandate the decision names — a conformance run names none,
        and those rows would drop out of the count.
      </Note>
    </StatCard>
  );
}

export function AuthorizationCards({ overview }: { overview: AuthorizationsOverview }) {
  return (
    <Quadrant>
      <Live overview={overview} />
      <Reach overview={overview} />
      <Ceilings mandates={overview.mandates} />
      <Gate reasons={overview.reasons} />
    </Quadrant>
  );
}
