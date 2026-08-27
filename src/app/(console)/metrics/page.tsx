import { gateBreakdown } from "@/core/db/queries";
import { metricsOverview } from "@/core/db/overview/metrics";
import { GateTable } from "./gate";
import { MetricCards } from "./cards";
import { PageHeading, ScrollPanel } from "../ui";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  // Sequential, not Promise.all: each holds a pooled connection for its whole chain, and the pool
  // is twelve. See the same note in src/core/db/queries.ts — this is the layer that kept undoing it.
  const overview = await metricsOverview();
  const gate = await gateBreakdown();

  return (
    <>
      <PageHeading
        title="Metrics"
        subtitle="Two cards of gate numbers, then two of settlement — in that order, and never as one figure."
      />
      <MetricCards overview={overview} />

      <ScrollPanel title="Every gate decision, grouped by source, class and outcome" count={gate.length}>
        <GateTable rows={gate} />
      </ScrollPanel>
    </>
  );
}
