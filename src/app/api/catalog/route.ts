import { handle, requireAgent } from "@/core/guards";
import { getCatalog } from "@/core/tools";
import { ok } from "@/core/http";

export async function GET(request: Request) {
  return handle("catalog", async () => {
    const caller = await requireAgent(request);
    if (!caller.ok) return caller.response;
    return ok(await getCatalog({ agentId: caller.value.id, source: "http" }));
  });
}
