import { agentOverview } from "@/core/db/overview/agent";
import { demoAgent } from "@/demo/agents";
import { PRESETS } from "@/demo/instructions";
import { PageHeading } from "../ui";
import { AgentConsole } from "./console";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const [shopbot, frozen] = await Promise.all([demoAgent("shopbot"), demoAgent("frozen")]);
  // Both, up front: the standing has to be on screen before the chip is switched, not after a run.
  const [active, halted] = await Promise.all([agentOverview(shopbot.id), agentOverview(frozen.id)]);

  return (
    <>
      <PageHeading
        title="Agent"
        subtitle="It holds an API key and no payment credential, and it cannot import the guard — that is an ESLint rule, so a build fails on it rather than a review catching it."
      />
      <AgentConsole presets={PRESETS} overviews={{ shopbot: active, frozen: halted }} />
    </>
  );
}
