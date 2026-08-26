"use client";

import type { DemoOverview } from "@/core/db/overview/demo";
import { formatInr } from "@/core/money";
import { BarRow, Big, Figure, Note, Quadrant, StatCard } from "../cards";

/** The number the whole narration turns on. Empty is a state, not a zero. */
function Mandate({ mandate }: { mandate: DemoOverview["mandate"] }) {
  return (
    <StatCard title="The mandate on the table" index={0}>
      {mandate === null ? (
        <>
          <Big value="—" caption="no live mandate" />
          <Note>
            Nothing confirmed, unexpired and held by an active agent. The page shows this rather
            than the next row down. Run <span className="font-mono">npm run db:seed</span>.
          </Note>
        </>
      ) : (
        <>
          <Big value={formatInr(mandate.availablePaise)} caption="left to spend" />
          <div className="mt-3 flex gap-6">
            <Figure label="per order" value={formatInr(mandate.maxPerOrderPaise)} />
            <Figure label="blocked" value={formatInr(mandate.maxAmountPaise)} />
          </div>
          <Note>
            {mandate.principalRef} delegated to {mandate.agentName}. What is left is the blocked
            amount minus what has been debited and what is still held — derived from the ledger.
          </Note>
        </>
      )}
    </StatCard>
  );
}

function Shelf({ shelf }: { shelf: DemoOverview["shelf"] }) {
  return (
    <StatCard title="What is on the shelf" index={1}>
      <Big value={shelf.active} caption={`listed in ${shelf.categories.length} categories`} />
      <div className="mt-4 flex flex-col gap-2">
        {shelf.categories.slice(0, 5).map((c) => (
          <BarRow key={c.name} name={c.name} value={c.n} of={shelf.active} />
        ))}
      </div>
      <Note>
        {shelf.outOfStock === 0
          ? "Every listed item is in stock. Only in-stock items are ever quoted."
          : `${shelf.outOfStock} listed but out of stock, and never quoted.`}
      </Note>
    </StatCard>
  );
}

/** GATE numbers. Stated in the Note because a settlement figure sits next to it. */
function Gate({ gate }: { gate: DemoOverview["gate"] }) {
  const rows = [
    ["ADMITTED", gate.admit, "ADMIT"],
    ["ESCALATED", gate.escalate, "ESCALATE"],
    ["REFUSED", gate.refuse, "REFUSE"],
  ] as const;

  return (
    <StatCard title="Already through the gate" index={2}>
      <Big value={gate.total} caption="decisions on the record" />
      <div className="mt-4 flex flex-col gap-2">
        {rows.map(([name, n, tone]) => (
          <BarRow key={name} name={name} value={n} of={gate.total} tone={tone} />
        ))}
      </div>
      <Note>Gate numbers: admission decisions. A refusal never became an order.</Note>
    </StatCard>
  );
}

/** SETTLEMENT numbers, and they are never added to the decision counts beside them. */
function Settled({ settlement }: { settlement: DemoOverview["settlement"] }) {
  return (
    <StatCard title="What actually settled" index={3}>
      <Big value={formatInr(settlement.debitedPaise)} caption="debited against the block" />
      <div className="mt-3 flex gap-6">
        <Figure label="orders paid" value={String(settlement.paid)} />
        <Figure label="orders raised" value={String(settlement.attempted)} />
      </div>
      <Note>Settlement numbers: money that moved, in Razorpay test mode. Counted apart from the gate.</Note>
    </StatCard>
  );
}

export function DemoCards({ overview }: { overview: DemoOverview }) {
  return (
    <Quadrant>
      <Mandate mandate={overview.mandate} />
      <Shelf shelf={overview.shelf} />
      <Gate gate={overview.gate} />
      <Settled settlement={overview.settlement} />
    </Quadrant>
  );
}
