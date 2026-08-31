// Unauthenticated by the same reasoning as /pay/[orderId] itself: whoever holds the link can pay
// this order, so whoever holds the link can refuse it.
import { handle } from "@/core/guards";
import { fail, ok } from "@/core/http";
import { declineOrder } from "@/core/orders/decline";

export async function POST(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  return handle("decline", async () => {
    const r = await declineOrder((await ctx.params).orderId);
    return r.ok ? ok(r) : fail(r.code);
  });
}
