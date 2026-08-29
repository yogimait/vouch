import { decisionsOverview, listDecisions } from "@/core/db/queries";
import { DataTable } from "@/components/data-table";
import { DECISION_COLUMNS } from "./columns";
import { DecisionCards } from "./cards";
import { Empty, ScrollPanel } from "../ui";
import { Summary } from "../summary";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  // Sequential, not Promise.all: each holds a pooled connection for its whole chain, and the pool
  // is twelve. See the same note in src/core/db/queries.ts — this is the layer that kept undoing it.
  const rows = await listDecisions(100);
  const overview = await decisionsOverview();

  return (
    <>
      <Summary
        title="Decisions"
        subtitle="One row per call to pay, written before the money moves. A refusal never becomes an order, so for most of these this page is the only record."
      >
        <DecisionCards overview={overview} />
      </Summary>

      <ScrollPanel title="Every attempt, including the ones that never became an order" count={overview.totals.total}>
        <DataTable
          fill
          columns={DECISION_COLUMNS}
          rows={rows}
          rowKey={(d) => d.id}
          empty={<Empty title="No decisions yet." hint="A row appears the moment an agent calls pay — before the order is created, not after. Run: npm run demo:1" />}
        />
      </ScrollPanel>
    </>
  );
}
