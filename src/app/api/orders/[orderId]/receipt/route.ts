import { handle, requireAgent } from "@/core/guards";
import { getReceipt } from "@/core/tools";
import { fail, ok } from "@/core/http";

export async function GET(request: Request, ctx: { params: Promise<{ orderId: string }> }) {
  return handle("receipt", async () => {
    const caller = await requireAgent(request);
    if (!caller.ok) return caller.response;
    const r = await getReceipt({ agentId: caller.value.id, source: "http", ...(await ctx.params) });
    return r.ok ? ok(r) : fail(r.code, r.details);
  });
}
