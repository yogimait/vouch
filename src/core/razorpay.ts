// Three endpoints and one signature check. The official SDK is a dependency we do not need for
// this much surface, and plain fetch keeps the request and response shapes visible at the call site.
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/core/env";
import { toRazorpayAmount } from "@/core/money";

const API = "https://api.razorpay.com/v1";

export class GatewayError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Razorpay ${status}: ${body.slice(0, 300)}`);
    this.name = "GatewayError";
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new GatewayError(res.status, text);
  return JSON.parse(text) as T;
}

export interface GatewayOrder { id: string; amount: number; status: string }
export interface GatewayLink { id: string; short_url: string; status: string; reference_id?: string }

/**
 * Bound back to our row two ways — notes AND receipt — because webhook payload shapes differ per
 * event and the redundancy costs nothing.
 */
export async function createOrder(input: {
  orderId: string;
  amountPaise: bigint;
  notes: Record<string, string>;
}): Promise<GatewayOrder> {
  return call<GatewayOrder>("/orders", {
    amount: toRazorpayAmount(input.amountPaise),
    currency: "INR",
    receipt: input.orderId,
    notes: { ...input.notes, vouch_order_id: input.orderId },
  });
}

export async function createPaymentLink(input: {
  orderId: string;
  amountPaise: bigint;
  description: string;
  notes: Record<string, string>;
}): Promise<GatewayLink> {
  return call<GatewayLink>("/payment_links", {
    amount: toRazorpayAmount(input.amountPaise),
    currency: "INR",
    description: input.description.slice(0, 2048),
    reference_id: input.orderId,
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { ...input.notes, vouch_order_id: input.orderId },
  });
}

export interface GatewayLinkStatus extends GatewayLink {
  payments?: { payment_id: string; status: string; amount: number }[];
}

export async function getPaymentLink(linkId: string): Promise<GatewayLinkStatus> {
  return call<GatewayLinkStatus>(`/payment_links/${linkId}`);
}

/**
 * HMAC-SHA256 over the RAW body. Re-serialising a parsed object changes the bytes and the signature
 * no longer matches what was actually sent.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;

  // No secret configured means nothing can be trusted, so nothing is. Never treat it as "skip".
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not set — refusing every webhook.");
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(header, "hex");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export interface GatewayPayment { id: string; status: string; amount: number; error_description?: string }

/** The order is the authority when no payment link exists — which is now the ADMIT path. */
export async function getOrderPayments(razorpayOrderId: string): Promise<GatewayPayment[]> {
  const res = await call<{ items?: GatewayPayment[] }>(`/orders/${razorpayOrderId}/payments`);
  return res.items ?? [];
}
