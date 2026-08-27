import { agentOverview } from "@/core/db/overview/agent";
import { demoAgent } from "@/demo/agents";
import { PRESETS } from "@/demo/instructions";
import { demoEnabled } from "@/demo/route";
import { DemoGate, PageHeading } from "../ui";
import { AgentConsole } from "./console";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function AgentPage() {
  // Sequential, not Promise.all: each holds a pooled connection for its whole chain, and the pool
  // is twelve. See the same note in src/core/db/queries.ts — this is the layer that kept undoing it.
  const shopbot = await demoAgent("shopbot");
  const frozen = await demoAgent("frozen");
  // Both, up front: the standing has to be on screen before the chip is switched, not after a run.
  const active = await agentOverview(shopbot.id);
  const halted = await agentOverview(frozen.id);

  return (
    <>
      <PageHeading
        title="Agent"
        subtitle="It holds an API key and no payment credential, and it cannot import the guard — that is an ESLint rule, so a build fails on it rather than a review catching it."
      />
      <DemoGate enabled={demoEnabled()} />
      <AgentConsole presets={PRESETS} overviews={{ shopbot: active, frozen: halted }} />
    </>
  );
}
