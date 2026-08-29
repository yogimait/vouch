import type { MisquoteRow } from "@/core/db/queries";
import { DataTable, type Column } from "@/components/data-table";
import { formatInr } from "@/core/money";
import { Empty } from "../ui";
import { When } from "../when";

const COLUMNS: Column<MisquoteRow>[] = [
  { header: "When", cell: (m) => <When at={m.createdAt} /> },
  { header: "Agent", cell: (m) => m.agentName },
  { header: "Kind", cell: (m) => <span className="font-mono text-xs text-refuse">{m.kind}</span> },
  {
    header: "Claimed",
    cell: (m) => <span className="font-mono text-xs">{m.claimedPaise !== null ? formatInr(m.claimedPaise) : m.claimedDiscountCode ?? "—"}</span>,
  },
  { header: "Signed", cell: (m) => <span className="font-mono text-xs">{m.signedPaise !== null ? formatInr(m.signedPaise) : "—"}</span> },
  {
    header: "In its own words",
    wrap: true,
    className: "max-w-[34rem] text-xs text-fg-2",
    cell: (m) =>
      m.rawAgentText ? `"${m.rawAgentText.replace(/\s+/g, " ").slice(0, 260)}"` : <span className="text-fg-3">not captured</span>,
  },
];

/** Rendered per source and never across sources — the totals must not be addable by eye either. */
export function MisquoteTable({ rows, empty }: { rows: MisquoteRow[]; empty: string }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(m) => m.id}
      empty={<Empty title="Nothing recorded." hint={empty} />}
    />
  );
}
