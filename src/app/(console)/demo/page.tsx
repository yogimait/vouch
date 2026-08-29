import { demoOverview } from "@/core/db/overview/demo";
import { demoConsole } from "@/demo/console";
import { demoEnabled } from "@/demo/route";
import { DEFAULT_INSTRUCTION } from "@/demo/agent";
import { DemoGate, PageScroll } from "../ui";
import { Summary } from "../summary";
import { DemoCards } from "./cards";
import { Acts, type Act } from "./acts";
import { GatePanel } from "./gate-panel";
import { AgentPanel } from "./agent-panel";
import { BuyPanel } from "./buy-panel";
import { ReceiptPanel } from "./receipt-panel";
import { ResetButton } from "./reset-button";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  // Sequential, not Promise.all: each of these holds a pooled connection, and six pages doing this
  // at once exhausted the pool. src/core/db/queries.ts states the rule the data layer follows.
  const { items, settled } = await demoConsole();
  const overview = await demoOverview();

  const acts: Act[] = [
    { title: "The agent", asks: "Given a goal it cannot reach honestly, what does a real model do?", body: <AgentPanel instruction={DEFAULT_INSTRUCTION} /> },
    { title: "The policy engine", asks: "What does it stop, and how fast?", body: <GatePanel /> },
    { title: "The money", asks: "Buy something, and watch the decision that lets it through.", body: <BuyPanel items={items} /> },
    { title: "The proof", asks: "Change one field of a signed receipt. Does anyone notice?", body: <ReceiptPanel settled={settled} /> },
  ];

  return (
    <>
      <Summary
        title="Live demo"
        subtitle="Four acts. Every number on this page is produced by the same code path a real agent uses."
      >
        <DemoCards overview={overview} />
      </Summary>
      <DemoGate enabled={demoEnabled()} />

      <PageScroll>
        <Acts acts={acts} aside={<Reset />} />
      </PageScroll>
    </>
  );
}

/** Under the acts, not above them: it undoes what they did, so it reads after rather than before. */
function Reset() {
  return (
    <div className="rounded-[3px] border border-hairline p-4">
      <p className="text-xs leading-relaxed text-fg-3">
        Every act runs against the mandate in the summary, and spends it. The cards move as the acts do.
      </p>
      <div className="mt-3"><ResetButton /></div>
    </div>
  );
}
