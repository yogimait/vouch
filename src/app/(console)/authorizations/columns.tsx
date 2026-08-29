import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MandateRow } from "@/core/db/overview/authorizations";
import { formatInr } from "@/core/money";
import type { Column } from "@/components/data-table";
import { Id } from "../ui";
import { pct } from "./capacity-bar";

const STATUS_TONE: Record<string, string> = {
  confirmed: "text-admit",
  rejected: "text-refuse",
  expired: "text-refuse",
  initiated: "text-fg-2",
  completed: "text-fg-2",
};

/** The capacity bar at row scale. Same three parts, same order, no numbers invented for the width. */
function Capacity({ m }: { m: MandateRow }) {
  const debited = pct(m.debitedPaise, m.maxAmountPaise);
  const held = pct(m.heldPaise, m.maxAmountPaise);

  return (
    <div className="w-44">
      <div className="flex h-1.5 overflow-hidden rounded-[1px] border border-hairline">
        <div className="bg-primary" style={{ width: `${debited}%` }} />
        <div className="bg-primary/35" style={{ width: `${held}%` }} />
        <div className="flex-1 bg-white/[0.04]" />
      </div>
      <div className="mt-1.5 font-mono text-xs text-fg-3">
        <span className="text-fg">{formatInr(m.availablePaise)}</span> of {formatInr(m.maxAmountPaise)}
      </div>
    </div>
  );
}

export const MANDATE_COLUMNS: Column<MandateRow>[] = [
  {
    header: "Agent",
    cell: (m) => (
      <>
        {m.agentName}
        <div><Id value={m.agentId} /></div>
      </>
    ),
  },
  {
    header: "Acting for",
    cell: (m) => <span className="font-mono text-xs">{m.principalRef}</span>,
  },
  {
    header: "Status",
    cell: (m) => (
      <>
        <span className={`text-xs tracking-wide uppercase ${STATUS_TONE[m.status] ?? "text-fg-2"}`}>{m.status}</span>
        {/* A mandate can be confirmed while the agent holding it is frozen. Both, or neither is true. */}
        {m.agentStatus === "FROZEN" && <div className="text-xs tracking-wide text-refuse uppercase">agent frozen</div>}
      </>
    ),
  },
  { header: "Left to spend", cell: (m) => <Capacity m={m} /> },
  {
    header: "Per order",
    align: "right",
    cell: (m) => <span className="font-mono text-xs">{formatInr(m.maxPerOrderPaise)}</span>,
  },
  {
    header: "Expires",
    align: "right",
    cell: (m) => <span className="font-mono text-xs">{m.daysToExpiry}d</span>,
  },
  {
    header: "",
    align: "right",
    cell: (m) => (
      <Button asChild size="sm" variant="outline" className="h-7 rounded-[2px] px-3 text-xs">
        <Link href={`/authorizations/${m.id}`}>Open</Link>
      </Button>
    ),
  },
];
