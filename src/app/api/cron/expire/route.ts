// GET with CRON_SECRET as the bearer, because that is what Vercel's scheduler sends. Schedule and
// its Hobby-plan caveat are explained in core/orders/expire.ts.
import { cronAuthorized, handle } from "@/core/guards";
import { fail, ok } from "@/core/http";
import { expireStaleOrders } from "@/core/orders/expire";
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return fail("AGENT_UNKNOWN", { reason: "cron" });
  return handle("cron.expire", async () => {
    const s = await expireStaleOrders();
    return ok({ ...s, releasedPaise: s.releasedPaise.toString() });
  });
}
