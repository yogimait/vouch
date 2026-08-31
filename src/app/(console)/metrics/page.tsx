import { gateBreakdown } from "@/core/db/queries";
import { metricsOverview } from "@/core/db/overview/metrics";
import { demoEnabled } from "@/demo/route";
import { GateTable } from "./gate";
import { GatePanel } from "./gate-panel";
import { MetricCards } from "./cards";
import { ScrollPanel } from "../ui";
import { Summary } from "../summary";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  // Sequential, not Promise.all: each holds a pooled connection for its whole chain, and the pool
  // is twelve. See the same note in src/core/db/queries.ts — this is the layer that kept undoing it.
  const overview = await metricsOverview();
  const gate = await gateBreakdown();

  return (
    <>
      <Summary
        title="Metrics"
        subtitle="Two cards of gate numbers, then two of settlement — in that order, and never as one figure."
      >
        <MetricCards overview={overview} />
      </Summary>

      <ScrollPanel title="Every gate decision, grouped by source, class and outcome" count={gate.length}>
        <GateTable rows={gate} />
      </ScrollPanel>

      {/* Measured on demand, never stored: this path calls the pure engine, so it belongs beside the
          numbers rather than on a page of its own.
          Collapsed, and shrink-0: as a second flex-1 panel it took half the height off the log above
          it and spent it on a button, which is how the log stopped being readable. */}
      {demoEnabled() && (
        <details className="mt-2 shrink-0">
          {/* A bare control, not a bordered panel: every pixel it takes comes straight out of the
              log above it, which on this page only has about four rows to give. */}
          <summary className="label cursor-pointer select-none py-1.5 hover:text-primary">
            Put every condition through the engine, now
          </summary>
          <div className="mt-2 max-h-[45vh] overflow-y-auto rounded-[3px] border border-hairline p-4">
            <GatePanel />
          </div>
        </details>
      )}
    </>
  );
}
