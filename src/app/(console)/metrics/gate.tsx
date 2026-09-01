import type { GateRow } from "@/core/db/queries";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { Empty, latency, Outcome, type OutcomeValue } from "../ui";
import { sourceLabel } from "../format";

const COLUMNS: Column<GateRow>[] = [
  { header: "Source", cell: (r) => <Badge variant="outline" className="rounded-[2px] font-mono text-fg-3">{sourceLabel(r.source)}</Badge> },
  { header: "Violation class", cell: (r) => <span className="font-mono text-xs">{r.label ?? "—"}</span> },
  { header: "Outcome", cell: (r) => <Outcome value={r.outcome as OutcomeValue} /> },
  { header: "Count", align: "right", cell: (r) => <span className="font-mono tabular-nums">{r.n}</span> },
  { header: "p50", align: "right", cell: (r) => <span className="font-mono text-xs text-fg-3">{latency(r.p50Ms)}</span> },
];

/** Source is a column, not a tab: the rows have to sit together to be read as separate clocks. */
export function GateTable({ rows }: { rows: GateRow[] }) {
  return (
    <DataTable
      fill
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => `${r.source}-${r.label}-${r.outcome}`}
      empty={<Empty title="No decisions yet." hint="The labelled violation classes appear once a conformance run has been through the gate." />}
    />
  );
}
