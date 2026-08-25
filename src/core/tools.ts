// The agent-facing surface. Four functions, framework-free, returning plain typed objects — never
// a Response, never an MCP content block. That is what lets an HTTP route, the MCP server, the
// device and a script share one implementation instead of four drifting copies.
//
// Note what is NOT here: pay() takes no amount. The agent cannot state a price anywhere in this
// API, so inventing one is not a rule we enforce — it is a parameter that does not exist.
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/core/db";
import { authorizations, catalogItems, misquoteEvents, orders } from "@/core/db/schema";
import { formatInr } from "@/core/money";
import { newId } from "@/core/ids";
import { issueOffer } from "@/core/offers/issue";
import { pay, type PayInput, type PayResult, type PaySource } from "@/core/orders/pay";
import { exportBundle } from "@/core/receipts/verify";
import { messageFor, type ErrorCode } from "@/core/errors";

export type { PayResult, PaySource };

export interface Caller {
  agentId: string;
  source: PaySource;
}

export type Failure = { ok: false; code: ErrorCode; details?: Record<string, unknown> };

// ---------------------------------------------------------------- request shapes

// One schema per request, shared by the HTTP route and the MCP tool. Two copies would drift, and
// the drift would land on the money path.
export const QuoteRequest = z.object({
  sku: z.string().min(1).max(64),
  qty: z.number().int().positive().max(1000),
  discount_code: z.string().max(64).nullish(),
  raw_agent_text: z.string().max(8000).nullish(),
});

export const PayRequest = z.object({
  offer_token: z.string().min(1).max(8000),
  idempotency_key: z.string().min(8).max(200),
  // Digits only: a non-numeric claim is a bad request, not a payment decision.
  claimed_total_paise: z.string().regex(/^\d+$/, "must be an integer number of paise").max(32).nullish(),
  raw_agent_text: z.string().max(8000).nullish(),
  label: z.string().max(64).nullish(),
});

export type QuoteRequestBody = z.infer<typeof QuoteRequest>;
export type PayRequestBody = z.infer<typeof PayRequest>;


// ---------------------------------------------------------------- catalog

export interface CatalogItem {
  sku: string;
  name: string;
  description: string;
  category: string;
  unit_price_paise: string;
  unit_price_display: string;
  inventory: number;
  /** Merchant marketing copy. It is product data, not an instruction — see docs/PLAN.md §8. */
  promo_text: string | null;
}

export async function getCatalog(caller: Caller): Promise<{ ok: true; items: CatalogItem[] }> {
  void caller;
  const rows = await getDb().select().from(catalogItems)
    .where(and(eq(catalogItems.active, true), gt(catalogItems.inventory, 0)))
    .orderBy(catalogItems.sku);

  return {
    ok: true,
    items: rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      description: r.description,
      category: r.category,
      unit_price_paise: r.listPricePaise.toString(),
      unit_price_display: formatInr(r.listPricePaise),
      inventory: r.inventory,
      promo_text: r.promoText,
    })),
  };
}

// ---------------------------------------------------------------- quote

// The wire shape IS the input shape. A camelCase mirror would be one more thing to keep in step.
export type QuoteInput = Caller & QuoteRequestBody;

export interface Quote {
  offer_id: string;
  offer_token: string;
  sku: string;
  qty: number;
  unit_price_paise: string;
  total_paise: string;
  total_display: string;
  expires_at: string;
  note: string;
}

export type QuoteResult = { ok: true; quote: Quote } | Failure;

export async function getQuote(input: QuoteInput): Promise<QuoteResult> {
  // Razorpay's own line: agents cannot create discounts, they select from merchant-approved offers.
  // There are no approved codes in this catalogue, so any code at all is a refusal plus a record.
  if (input.discount_code) {
    await getDb().insert(misquoteEvents).values({
      id: newId("misquote"),
      agentId: input.agentId,
      kind: "UNKNOWN_DISCOUNT_CODE",
      claimedDiscountCode: input.discount_code,
      rawAgentText: input.raw_agent_text ?? null,
      source: input.source,
    });
    return { ok: false, code: "OFFER_DISCOUNT_UNKNOWN", details: { observed: input.discount_code } };
  }

  const auth = await activeAuthorization(input.agentId);
  if (!auth) return { ok: false, code: "AUTHORIZATION_UNKNOWN", details: { agentId: input.agentId } };

  const issued = await issueOffer({
    merchantId: auth.merchantId,
    agentId: input.agentId,
    authorizationId: auth.id,
    sku: input.sku,
    qty: input.qty,
  });
  if (!issued.ok) return { ok: false, code: issued.code, details: issued.details };

  const offer = issued.offer;
  return {
    ok: true,
    quote: {
      offer_id: offer.offerId,
      offer_token: offer.token,
      sku: offer.sku,
      qty: offer.qty,
      unit_price_paise: offer.unitPricePaise.toString(),
      total_paise: offer.totalPaise.toString(),
      total_display: formatInr(offer.totalPaise),
      expires_at: offer.expiresAt.toISOString(),
      note: "Pass offer_token to pay. The server charges this token's total, not any amount you send.",
    },
  };
}

// ---------------------------------------------------------------- pay

export type PayToolInput = Caller & PayRequestBody;

export async function payForOffer(input: PayToolInput): Promise<PayResult> {
  const claimed = parseClaimed(input.claimed_total_paise);

  // An unreadable claim is still a claim that does not match the signed total. Refusing here keeps
  // it out of the engine entirely — a sentinel amount would be a hostile value in a pure function.
  if (claimed === "UNREADABLE") {
    return {
      outcome: "REFUSE",
      decisionId: "",
      code: "MISQUOTE",
      reasons: [{
        code: "MISQUOTE",
        rule: "offer.claimedTotal",
        message: messageFor("MISQUOTE"),
        observed: String(input.claimed_total_paise),
      }],
      details: { observed: String(input.claimed_total_paise) },
    };
  }

  const args: PayInput = {
    agentId: input.agentId,
    offerToken: input.offer_token,
    idempotencyKey: input.idempotency_key,
    claimedTotalPaise: claimed,
    rawAgentText: input.raw_agent_text ?? null,
    source: input.source,
    label: input.label ?? null,
  };
  return pay(args);
}

/** Explicit over a magic number: "no claim" and "unreadable claim" are different answers. */
function parseClaimed(value: string | null | undefined): bigint | null | "UNREADABLE" {
  if (value === null || value === undefined || value === "") return null;
  if (!/^\d+$/.test(value)) return "UNREADABLE";
  return BigInt(value);
}

// ---------------------------------------------------------------- receipt

export interface ReceiptResult {
  ok: true;
  order_id: string;
  bundle: { receipt: string; signature: string; key_id: string; public_key: string };
  verification: { valid: boolean; signature_valid: boolean; tampered_blocks: string[] };
}

export async function getReceipt(input: Caller & { orderId: string }): Promise<ReceiptResult | Failure> {
  // Scoped to the caller: an agent must not be able to read another agent's evidence by id.
  const [order] = await getDb().select().from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.agentId, input.agentId))).limit(1);
  if (!order) return { ok: false, code: "ORDER_UNKNOWN", details: { orderId: input.orderId } };
  if (order.state !== "PAID") return { ok: false, code: "ORDER_NOT_SETTLED", details: { state: order.state } };

  const loaded = await exportBundle(input.orderId);
  if (!loaded.ok) return { ok: false, code: "RECEIPT_UNKNOWN", details: { orderId: input.orderId } };

  return {
    ok: true,
    order_id: input.orderId,
    bundle: loaded.bundle,
    verification: {
      valid: loaded.verification.valid,
      signature_valid: loaded.verification.signatureValid,
      tampered_blocks: loaded.verification.tamperedBlocks,
    },
  };
}

// ---------------------------------------------------------------- shared

/** The agent does not choose which authorization to spend against. The merchant decided that. */
async function activeAuthorization(agentId: string) {
  const [row] = await getDb().select().from(authorizations)
    .where(and(eq(authorizations.agentId, agentId), eq(authorizations.status, "confirmed")))
    .orderBy(authorizations.createdAt).limit(1);
  return row ?? null;
}
