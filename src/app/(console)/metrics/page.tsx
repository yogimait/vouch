import { gateBreakdown } from "@/core/db/queries";
import { metricsOverview } from "@/core/db/overview/metrics";
import { GateTable } from "./gate";
import { MetricCards } from "./cards";
import { PageHeading, ScrollPanel } from "../ui";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const [overview, gate] = await Promise.all([metricsOverview(), gateBreakdown()]);

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
