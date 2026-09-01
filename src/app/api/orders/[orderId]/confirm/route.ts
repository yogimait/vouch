// Razorpay is asked, not the browser: the checkout callback runs on a page the payer controls.
// Unauthenticated by design (a payer holds no agent key), so it is limited per order — see limit.ts.
import { fail, ok } from "@/core/http";
import { handle } from "@/core/guards";
import { take } from "@/core/limit";
import { confirmOrder } from "@/core/orders/confirm";
export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  if (!take(`confirm:${orderId}`, 20, 60_000).ok) return fail("RATE_LIMITED");
  const n = Math.min(3, Math.max(1, Number(new URL(req.url).searchParams.get("attempts")) || 3));
  return handle("confirm", async () => ok(await confirmOrder(orderId, n)));
}
