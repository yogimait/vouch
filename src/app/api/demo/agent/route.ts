import { eventStream } from "@/core/http";
import { DEFAULT_INSTRUCTION, agentStream } from "@/demo/agent";
import { demoRoute } from "@/demo/route";

// GET so EventSource can open it. The run mutates nothing an agent could not mutate itself.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const who = query.get("agent") === "frozen" ? "frozen" : "shopbot";
  const asked = query.get("instruction")?.slice(0, 2000) || DEFAULT_INSTRUCTION;
  return demoRoute("demo.agent", async () => eventStream(agentStream(asked, who)));
}
