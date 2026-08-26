import { demoOverview } from "@/core/db/overview/demo";
import { demoConsole } from "@/demo/console";
import { DEFAULT_INSTRUCTION } from "@/demo/agent";
import { PageHeading, PageScroll } from "../ui";
import { DemoCards } from "./cards";
import { Panel } from "./panel";
import { GatePanel } from "./gate-panel";
import { AgentPanel } from "./agent-panel";
import { BuyPanel } from "./buy-panel";
import { ReceiptPanel } from "./receipt-panel";
import { ResetButton } from "./reset-button";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const [{ items, settled }, overview] = await Promise.all([demoConsole(), demoOverview()]);

  return (
    <>
      <PageHeading
        title="Live demo"
        subtitle="Four acts. Every number on this page is produced by the same code path a real agent uses."
      />
      <DemoCards overview={overview} />

      <PageScroll>
        <div className="mt-6 mb-12 flex flex-wrap items-center justify-between gap-4 border-y border-hairline py-4">
          <p className="text-sm text-fg-2">
            Each act runs against the mandate above, and spends it. The cards move as the acts do.
          </p>
          <ResetButton />
        </div>

        <Panel n={1} title="The agent" asks="Given a goal it cannot reach honestly, what does a real model do?">
          <AgentPanel instruction={DEFAULT_INSTRUCTION} />
        </Panel>

        <Panel n={2} title="The policy engine" asks="What does it stop, and how fast?">
          <GatePanel />
        </Panel>

        <Panel n={3} title="The money" asks="Buy something, and watch the decision that lets it through.">
          <BuyPanel items={items} />
        </Panel>

        <Panel n={4} title="The proof" asks="Change one field of a signed receipt. Does anyone notice?">
          <ReceiptPanel settled={settled} />
        </Panel>
      </PageScroll>
    </>
  );
}
