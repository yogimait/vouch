// GET because that is what Vercel's scheduler sends, and it sends CRON_SECRET as the bearer itself.
import { cronAuthorized, handle } from "@/core/guards";
import { fail, ok } from "@/core/http";
import { expireStaleOrders } from "@/core/orders/expire";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return fail("AGENT_UNKNOWN", { reason: "cron" });
  return handle("cron.expire", async () => {
    const sweep = await expireStaleOrders();
    return ok({ ...sweep, releasedPaise: sweep.releasedPaise.toString() });
  });
}
