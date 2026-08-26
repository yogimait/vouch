import { ok } from "@/core/http";
import { handle } from "@/core/guards";
import { confirmOrder } from "@/core/orders/confirm";

// Razorpay is asked, not the browser. The checkout callback runs on a page the payer controls.
export async function POST(_: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  return handle("confirm", async () => ok(await confirmOrder(orderId, 3)));
}
