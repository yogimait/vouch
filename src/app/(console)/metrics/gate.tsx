import type { GateRow } from "@/core/db/queries";
import { DataTable, type Column } from "@/components/data-table";
import { latency, Outcome, type OutcomeValue } from "../ui";

const COLUMNS: Column<GateRow>[] = [
  { header: "Violation class", cell: (r) => <span className="font-mono text-xs">{r.label ?? "—"}</span> },
  { header: "Outcome", cell: (r) => <Outcome value={r.outcome as OutcomeValue} /> },
  { header: "Count", align: "right", cell: (r) => <span className="font-mono tabular-nums">{r.n}</span> },
  { header: "p50", align: "right", cell: (r) => <span className="font-mono text-xs text-fg-3">{latency(r.p50Ms)}</span> },
];

/** Grouped by source first. A single "total decisions" figure across sources would be a lie. */
export function GateTable({ rows, source }: { rows: GateRow[]; source: string }) {
  const mine = rows.filter((r) => r.source === source);
  if (mine.length === 0) return <p className="text-sm text-fg-3">Nothing recorded from {source}.</p>;

  return (
    <>
      <DataTable columns={COLUMNS} rows={mine} rowKey={(r) => `${r.label}-${r.outcome}`} empty={null} />
      <p className="mt-3 text-xs text-fg-3">{mine.reduce((n, r) => n + r.n, 0)} decisions from {source}.</p>
    </>
  );
}
