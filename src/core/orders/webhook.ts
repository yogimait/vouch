// Handler order IS the security property:
// raw bytes -> store (even unverified) -> replay short-circuit -> audit -> state -> COMMIT.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { orders, webhookEvents } from "@/core/db/schema";
import { newId } from "@/core/ids";
import { writeAudit } from "@/core/audit/log";
import { commit, release } from "@/core/ledger";
import { setOrderState } from "@/core/orders/state";
import { verifyWebhookSignature } from "@/core/razorpay";

export interface WebhookResult {
  accepted: boolean;
  reason: "processed" | "replayed" | "unmatched" | "ignored" | "signature_invalid";
  orderId?: string;
}

interface Payload {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; notes?: Record<string, string>; error_description?: string } };
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
  const paymentId = body.payload?.payment?.entity?.id ?? null;
  const moved = await setOrderState({
    orderId: order.id, next: "PAID", razorpayPaymentId: paymentId, settledAt: new Date(),
  });

  // COMMIT only alongside a real transition. A replay that finds the order already PAID must not
  // debit the authorization a second time.
  if (moved.changed) {
    const done = await commit(order.id);
    await writeAudit({
      eventType: "COMMIT",
      actor: "guard",
      orderId: order.id,
      payload: { amountPaise: done.amountPaise.toString(), applied: done.applied, razorpayPaymentId: paymentId, rawBodySha256: hash },
    });
  }

  await markProcessed(hash);
  return { accepted: true, reason: moved.changed ? "processed" : "replayed", orderId: order.id };
}

async function failed(order: typeof orders.$inferSelect, body: Payload): Promise<WebhookResult> {
  const reason = body.payload?.payment?.entity?.error_description ?? "payment failed";
  const moved = await setOrderState({ orderId: order.id, next: "FAILED", failureReason: reason });

  if (moved.changed) {
    const given = await release(order.id);
    await writeAudit({
      eventType: "RELEASE",
      actor: "guard",
      orderId: order.id,
      payload: { amountPaise: given.amountPaise.toString(), applied: given.applied, reason },
    });
  }

  return { accepted: true, reason: moved.changed ? "processed" : "replayed", orderId: order.id };
}

async function markProcessed(eventId: string): Promise<void> {
  await getDb().update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.razorpayEventId, eventId));
}
