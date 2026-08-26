// Razorpay is the authority on whether it captured — never the browser that was just driven, and
// never the checkout callback, which runs on a page the payer controls.
//
// Used by the authorization device and by the checkout page once a human has paid. Both learn the
// same way, and both produce a receipt that says mode:"polled" rather than implying a signature.
import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { orders } from "@/core/db/schema";
import { getOrderPayments, getPaymentLink } from "@/core/razorpay";
import { failOrder, settleOrder } from "@/core/orders/settle";

export type Confirmation =
  | { status: "PAID"; paymentId: string; receiptId: string | null; alreadySettled: boolean }
  | { status: "FAILED"; releasedPaise: string }
  | { status: "PENDING" }
  | { status: "UNKNOWN_ORDER" };

interface Seen { id: string; status: string }

/** Whichever exists: a link when a human was meant to open one, the order otherwise. */
async function payments(order: { razorpayPaymentLinkId: string | null; razorpayOrderId: string | null }): Promise<Seen[]> {
  if (order.razorpayPaymentLinkId) {
    const link = await getPaymentLink(order.razorpayPaymentLinkId);
    return link.payments?.map((p) => ({ id: p.payment_id, status: p.status })) ?? [];
  }
  return (await getOrderPayments(order.razorpayOrderId!)).map((p) => ({ id: p.id, status: p.status }));
}

export async function confirmOrder(orderId: string, attempts = 10): Promise<Confirmation> {
  const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { status: "UNKNOWN_ORDER" };
  if (order.state === "PAID") {
    return { status: "PAID", paymentId: order.razorpayPaymentId ?? "", receiptId: null, alreadySettled: true };
  }
  if (!order.razorpayPaymentLinkId && !order.razorpayOrderId) return { status: "PENDING" };

  let attempted = false;
  for (let i = 0; i < attempts; i++) {
    const seen = await payments(order);
    const captured = seen.find((p) => p.status === "captured");
    if (captured) {
      const settlement = await settleOrder(order.id, captured.id, { source: "polled" });
      return {
        status: "PAID", paymentId: captured.id,
        receiptId: settlement.receiptId, alreadySettled: !settlement.changed,
      };
    }
    // A payment that exists but never captured is a failure, not a slow success.
    if (seen.length > 0) attempted = true;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 3000));
  }

  // Only fail when a payment was actually attempted. A link nobody opened is still pending, and
  // failing it would release a hold that should stand.
  if (!attempted) return { status: "PENDING" };

  const failed = await failOrder(order.id, "payment attempted but not captured", { source: "polled" });
  return { status: "FAILED", releasedPaise: failed.releasedPaise.toString() };
}
