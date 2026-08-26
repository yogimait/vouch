// Which agent the console acts as. The keys are the seeded demo keys and nothing else is accepted,
// so a demo route can never be pointed at a real credential.
import { agentByKey, type AgentRow } from "@/core/guards";
import { DEMO_KEYS } from "@/core/db/seed";

export type DemoAgent = keyof typeof DEMO_KEYS;

export async function demoAgent(which: DemoAgent = "shopbot"): Promise<AgentRow> {
  const key = which === "frozen" ? DEMO_KEYS.frozen : (process.env.VOUCH_AGENT_KEY ?? DEMO_KEYS.shopbot);
  const agent = await agentByKey(key);
  if (!agent) throw new Error("No seeded agent. Run `npm run db:seed`.");
  return agent;
}
