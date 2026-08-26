import { decisionTotals, listDecisions } from "@/core/db/queries";
import { DataTable } from "@/components/data-table";
import { DECISION_COLUMNS } from "./columns";
import { Empty, PageHeading, StatTile } from "../ui";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const [rows, totals] = await Promise.all([listDecisions(), decisionTotals()]);

  return (
    <>
      <PageHeading title="Decisions" subtitle="Every admission decision, including refusals that never became an order." />

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="decisions" value={String(totals.total)} />
        <StatTile label="admitted" value={String(totals.admit)} accent="ADMIT" />
        <StatTile label="escalated" value={String(totals.escalate)} accent="ESCALATE" />
        <StatTile label="refused" value={String(totals.refuse)} accent="REFUSE" />
      </div>

      <DataTable
        columns={DECISION_COLUMNS}
        rows={rows}
        rowKey={(d) => d.id}
        empty={<Empty title="No decisions yet." hint="Decisions appear the moment an agent calls pay. Run: npm run demo:1" />}
      />
    </>
  );
}
