// Handler order IS the security property:
// raw bytes -> store (even unverified) -> replay short-circuit -> audit -> state -> COMMIT.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { orders, webhookEvents } from "@/core/db/schema";
import { newId } from "@/core/ids";
import { writeAudit } from "@/core/audit/log";
import { failOrder, settleOrder } from "@/core/orders/settle";
import { verifyWebhookSignature } from "@/core/razorpay";

export interface WebhookResult {
  accepted: boolean;
  reason: "processed" | "replayed" | "unmatched" | "ignored" | "signature_invalid" | "mismatched";
  orderId?: string;
}

interface Payload {
  event?: string;
  payload?: {
    payment?: { entity?: {
      id?: string;
      /** Razorpay's own order id. Server-created, so this is the binding that cannot be forged. */
      order_id?: string;
      amount?: number;
      notes?: Record<string, string>;
      error_description?: string;
    } };
    payment_link?: { entity?: { reference_id?: string; id?: string } };
  };
}

/** Both bindings are read: notes and reference_id, because payload shape differs per event. */
function orderIdFrom(body: Payload): string | null {
  return body.payload?.payment?.entity?.notes?.vouch_order_id
    ?? body.payload?.payment_link?.entity?.reference_id
    ?? null;
}

export async function handleWebhook(rawBody: string, signatureHeader: string | null): Promise<WebhookResult> {
  const verified = verifyWebhookSignature(rawBody, signatureHeader);
  const hash = createHash("sha256").update(rawBody).digest("hex");

  let body: Payload = {};
  try {
    body = JSON.parse(rawBody) as Payload;
  } catch {
    // Keep it anyway: an unparseable body that claimed to be from Razorpay is itself evidence.
  }

  const event = body.event ?? "unknown";
  const orderId = orderIdFrom(body);
  // Razorpay's x-razorpay-event-id header is not in the body, so the body hash is the replay key.
  const eventId = hash;

  const inserted = await getDb().insert(webhookEvents).values({
    id: newId("webhook"),
    razorpayEventId: eventId,
    event,
    rawBody,
    rawBodySha256: hash,
    signatureHeader,
    signatureVerified: verified,
    orderId,
  }).onConflictDoNothing({ target: webhookEvents.razorpayEventId }).returning({ id: webhookEvents.id });

  if (!verified) return { accepted: false, reason: "signature_invalid" };
  if (inserted.length === 0) return { accepted: true, reason: "replayed", orderId: orderId ?? undefined };
  if (!orderId) return { accepted: true, reason: "unmatched" };

  const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { accepted: true, reason: "unmatched", orderId };

  await writeAudit({
    eventType: "WEBHOOK_RECEIVED",
    actor: "razorpay",
    orderId,
    payload: { event, rawBodySha256: hash, signatureVerified: verified },
  });

  if (event === "payment.captured" || event === "payment_link.paid") {
    return settled(order, body, hash);
  }
  if (event === "payment.failed") {
    return failed(order, body);
  }

  await markProcessed(eventId);
  return { accepted: true, reason: "ignored", orderId };
}

async function settled(
  order: typeof orders.$inferSelect,
  body: Payload,
  hash: string,
): Promise<WebhookResult> {
  const entity = body.payload?.payment?.entity;

  // notes.vouch_order_id is what found this order, and notes are client-supplied at checkout. The
  // gateway order id is not: we created it. Settling on the note alone let any signed webhook name
  // any order and take its full reserved amount. The amount is the belt on top of that brace.
  // Deny by default: once an order has a gateway order behind it, a capture that does not name it
  // -- including one that names nothing at all -- is not this order's payment.
  const mismatch = order.razorpayOrderId !== null
    ? entity?.order_id !== order.razorpayOrderId
      || (entity?.amount !== undefined && BigInt(entity.amount) !== order.amountPaise)
    : entity?.amount !== undefined && BigInt(entity.amount) !== order.amountPaise;

  if (mismatch) {
    await writeAudit({
      eventType: "WEBHOOK_RECEIVED",
      actor: "razorpay",
      orderId: order.id,
      payload: {
        rejected: "payment does not belong to this order",
        claimedRazorpayOrderId: entity?.order_id ?? null,
        expectedRazorpayOrderId: order.razorpayOrderId,
        claimedAmountPaise: entity?.amount !== undefined ? String(entity.amount) : null,
        expectedAmountPaise: order.amountPaise.toString(),
        rawBodySha256: hash,
      },
    });
    await markProcessed(hash);
    return { accepted: true, reason: "mismatched", orderId: order.id };
  }

  const settlement = await settleOrder(order.id, entity?.id ?? null, { source: "webhook", rawBodySha256: hash });

  await markProcessed(hash);
  return { accepted: true, reason: settlement.changed ? "processed" : "replayed", orderId: order.id };
}

async function failed(order: typeof orders.$inferSelect, body: Payload): Promise<WebhookResult> {
  const reason = body.payload?.payment?.entity?.error_description ?? "payment failed";
  const moved = await failOrder(order.id, reason, { source: "webhook" });
  return { accepted: true, reason: moved.changed ? "processed" : "replayed", orderId: order.id };
}

async function markProcessed(eventId: string): Promise<void> {
  await getDb().update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.razorpayEventId, eventId));
}
