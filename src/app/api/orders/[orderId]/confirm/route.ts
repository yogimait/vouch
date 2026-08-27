import { ok } from "@/core/http";
import { handle } from "@/core/guards";
import { confirmOrder } from "@/core/orders/confirm";

// Razorpay is asked, not the browser. The checkout callback runs on a page the payer controls.
// attempts=1 is the pre-flight: nobody has paid yet, so retrying only sleeps 3s per extra pass.
export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  const n = Math.min(5, Math.max(1, Number(new URL(req.url).searchParams.get("attempts")) || 3));
  return handle("confirm", async () => ok(await confirmOrder(orderId, n)));
}
