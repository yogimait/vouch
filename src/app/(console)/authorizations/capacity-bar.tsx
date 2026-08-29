import { Card } from "@/components/ui/card";
import type { MandateRow } from "@/core/db/overview/authorizations";
import { formatInr } from "@/core/money";
import { Field, Id } from "../ui";

interface Props { maxPaise: bigint; debitedPaise: bigint; heldPaise: bigint; availablePaise: bigint }

// Only 'confirmed' is good news. 'rejected' and 'expired' are refusals; the other two are neither,
// and painting all five in text-admit told the reader a rejected mandate was fine.
const STATUS_TONE: Record<string, string> = {
  confirmed: "text-admit",
  rejected: "text-refuse",
  expired: "text-refuse",
  initiated: "text-fg-2",
  completed: "text-fg-2",
};

/** Percentages only — this is layout, not money maths. Every displayed amount stays bigint. */
export function pct(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10000n) / whole) / 100;
}

export function CapacityBar({ maxPaise, debitedPaise, heldPaise, availablePaise }: Props) {
  const debited = pct(debitedPaise, maxPaise);
  const held = pct(heldPaise, maxPaise);

  return (
    <Card className="gap-0 rounded-[3px] p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="label">Authorized capacity</span>
        <span className="label">of {formatInr(maxPaise)}</span>
      </div>

      <div className="flex h-14 w-full overflow-hidden rounded-[2px] border border-hairline">
        <div
          className="bg-primary transition-[width] duration-[450ms] ease-overshoot"
          style={{ width: `${debited}%` }}
          title={`Debited ${formatInr(debitedPaise)}`}
        />
        {/* No minimum width: a tick for zero held would be money the ledger never reserved. */}
        <div
          className="bg-primary/35 transition-[width] duration-[450ms] ease-overshoot"
          style={{ width: `${held}%` }}
          title={`Held ${formatInr(heldPaise)}`}
        />
        {/* A faint fill so the bar still reads as a bar when nothing has been debited yet. */}
        <div className="flex-1 bg-white/[0.04]" title={`Available ${formatInr(availablePaise)}`} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {([
          ["debited", debitedPaise, "text-primary"],
          ["held", heldPaise, "text-primary/60"],
          ["available", availablePaise, "text-fg"],
        ] as const).map(([label, value, tone]) => (
          <div key={label}>
            <div className="label">{label}</div>
            <div className={`mt-1 font-mono text-base tabular-nums ${tone}`}>{formatInr(value)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** One mandate in full: who delegated it, what is left, and the scope the engine reads. */
export function MandateDetail({ m }: { m: MandateRow }) {
  return (
    <article className="pb-6">
      {/* The agent and the principal moved up to the page heading; what is left here is the record. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <Id value={m.id} head={12} tail={7} />
        <span className={`text-xs tracking-wide uppercase ${STATUS_TONE[m.status] ?? "text-fg-2"}`}>{m.status}</span>
        {m.agentStatus === "FROZEN" && <span className="text-xs tracking-wide text-refuse uppercase">agent frozen</span>}
        {m.frozenReason && <span className="text-xs text-fg-3">{m.frozenReason}</span>}
      </div>

      <CapacityBar
        maxPaise={m.maxAmountPaise}
        debitedPaise={m.debitedPaise}
        heldPaise={m.heldPaise}
        availablePaise={m.availablePaise}
      />

      <div className="mt-6 grid gap-x-12 gap-y-1 md:grid-cols-2">
        <section>
          <h2 className="label mb-2">The grant</h2>
          <Field label="granted_by">{m.grantedBy}</Field>
          <Field label="granted_via">{m.grantedVia}</Field>
          <Field label="granted_at">{m.grantedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</Field>
          <Field label="token_type">{m.tokenType}</Field>
          <Field label="frequency">{m.frequency}</Field>
          <Field label="signature"><Id value={m.grantSignature} /></Field>
        </section>
        <section>
          <h2 className="label mb-2">The scope</h2>
          <Field label="expire_at">{m.expireAt.toISOString().slice(0, 10)}</Field>
          <Field label="max_per_order">{formatInr(m.maxPerOrderPaise)}</Field>
          <Field label="max_orders_per_hour">{m.maxOrdersPerHour}</Field>
          <Field label="allowed_categories">{m.allowedCategories.join(", ") || "—"}</Field>
          {/* The list, when set, replaces the categories rather than narrowing within them. */}
          <Field label="allowed_skus">{m.allowedSkus.join(", ") || "any within category"}</Field>
        </section>
      </div>
    </article>
  );
}
