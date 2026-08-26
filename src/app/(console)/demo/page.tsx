import { PageHeading } from "../ui";
import { Panel } from "./panel";
import { GatePanel } from "./gate-panel";
import { AgentPanel } from "./agent-panel";
import { BuyPanel } from "./buy-panel";
import { ReceiptPanel } from "./receipt-panel";
import { ResetButton } from "./reset-button";
import { demoConsole } from "@/demo/console";
import { DEFAULT_INSTRUCTION } from "@/demo/agent";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const { items, settled, headroom, maxPerOrder } = await demoConsole();

  return (
    <>
      <PageHeading
        title="Live demo"
        subtitle="Four acts. Every number on this page is produced by the same code path a real agent uses."
      />

      <div className="mb-12 flex flex-wrap items-center justify-between gap-4 border-y border-hairline py-4">
        <p className="text-sm text-fg-2">
          Priya delegated to ShopBot: <span className="font-mono text-fg">{headroom}</span> left,
          at most <span className="font-mono text-fg">{maxPerOrder}</span> in any one order.
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
    </>
  );
}
