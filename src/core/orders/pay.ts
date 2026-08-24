// The money path. Order of operations is the security property here:
// resume -> verify -> decide -> AUDIT -> record decision -> hold -> gateway.
// The audit row is written before anything is held or charged, and awaited.
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import {
  authorizations, buyerAgents, catalogItems, decisions, misquoteEvents, offers, orders,
} from "@/core/db/schema";
import { newId } from "@/core/ids";
import { writeAudit } from "@/core/audit/log";
import { evaluate } from "@/core/engine/engine";
import type { AdmissionContext, AdmissionResult, Reason } from "@/core/engine/types";
import { balances, release, reserve } from "@/core/ledger";
import { setOrderState } from "@/core/orders/state";
import { verifyOffer, type VerifiedOffer } from "@/core/offers/verify";
import { createOrder, createPaymentLink, GatewayError } from "@/core/razorpay";
import type { ErrorCode } from "@/core/errors";
import { messageFor } from "@/core/errors";

export type PaySource = "mcp" | "http" | "llm" | "harness";

export interface PayInput {
  agentId: string;
  offerToken: string;
  idempotencyKey: string;
  claimedTotalPaise?: bigint | null;
  rawAgentText?: string | null;
  source: PaySource;
  label?: string | null;
  now?: Date;
}

export type PayResult =
  | { outcome: "ADMIT"; decisionId: string; orderId: string; amountPaise: bigint; authorizationUrl: string; replayed: boolean }
  | { outcome: "ESCALATE"; decisionId: string; orderId: string; amountPaise: bigint; paymentLink: string; reasons: Reason[]; replayed: boolean }
  | { outcome: "REFUSE"; decisionId: string; code: ErrorCode; reasons: Reason[]; details: Record<string, unknown> };

/** ASPG shipped this with the agent filter missing, which let one agent resume another's order. */
async function findResumable(agentId: string, idempotencyKey: string) {
  const [row] = await getDb().select().from(orders)
    .where(and(eq(orders.agentId, agentId), eq(orders.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

async function decisionIdFor(orderId: string): Promise<string> {
  const [row] = await getDb().select({ id: decisions.id }).from(decisions)
    .where(eq(decisions.orderId, orderId)).limit(1);
  return row?.id ?? "";
}

interface RecordInput {
  input: PayInput;
  result: AdmissionResult;
  offerId: string | null;
  authorizationId: string | null;
  orderId: string | null;
  balanceBeforePaise: bigint | null;
  policySnapshot: Record<string, unknown>;
}

/** Audit first, then the decision row. Nothing downstream runs until both have landed. */
async function record(r: RecordInput): Promise<string> {
  const decisionId = newId("decision");

  await writeAudit({
    eventType: "DECISION",
    actor: `agent:${r.input.agentId}`,
    agentId: r.input.agentId,
    orderId: r.orderId,
    payload: {
      decisionId,
      outcome: r.result.outcome,
      reasons: r.result.reasons,
      matchedRules: r.result.matchedRules,
      offerId: r.offerId,
      authorizationId: r.authorizationId,
      engineVersion: r.result.engineVersion,
    },
  });

  await getDb().insert(decisions).values({
    id: decisionId,
    agentId: r.input.agentId,
    orderId: r.orderId,
    offerId: r.offerId,
    authorizationId: r.authorizationId,
    outcome: r.result.outcome,
    reasons: r.result.reasons,
    matchedRules: r.result.matchedRules,
    escalatable: r.result.escalatable,
    policyVersion: r.result.policyVersion,
    policySnapshot: r.policySnapshot,
    authorizationBalanceBeforePaise: r.balanceBeforePaise,
    latencyMs: r.result.latencyMs,
    engineVersion: r.result.engineVersion,
    source: r.input.source,
    label: r.input.label ?? null,
  });

  return decisionId;
}

function refusal(code: ErrorCode, rule: string, details: Record<string, unknown> = {}): AdmissionResult {
  return {
    outcome: "REFUSE",
    reasons: [{
      code,
      rule,
      message: messageFor(code),
      observed: typeof details.observed === "string" ? details.observed : undefined,
      expected: typeof details.expected === "string" ? details.expected : undefined,
    }],
    matchedRules: [rule],
    escalatable: false,
    policyVersion: 1,
    engineVersion: "vouch-engine-1",
    latencyMs: 0,
  };
}

export async function pay(input: PayInput): Promise<PayResult> {
  const now = input.now ?? new Date();
  const db = getDb();

  const existing = await findResumable(input.agentId, input.idempotencyKey);
  if (existing) return resume(existing, await decisionIdFor(existing.id));

  const started = Date.now();
  const [agent] = await db.select().from(buyerAgents).where(eq(buyerAgents.id, input.agentId)).limit(1);
  if (!agent) {
    const result = refusal("AGENT_UNKNOWN", "agent.identity");
    const decisionId = await record({
      input, result, offerId: null, authorizationId: null, orderId: null,
      balanceBeforePaise: null, policySnapshot: {},
    });
    return { outcome: "REFUSE", decisionId, code: "AGENT_UNKNOWN", reasons: result.reasons, details: {} };
  }

  // A token that does not verify is not an admission question. It is refused with its own code so
  // the log says "expired" or "tampered", not a generic "unknown offer".
  const verified = await verifyOffer(input.offerToken, input.agentId, now);
  if (!verified.ok) {
    const code: ErrorCode = verified.failure === "OFFER_TAMPERED" ? "OFFER_SIGNATURE_INVALID" : verified.failure;
    const result = refusal(code, "offer.verify", verified.details);
    result.latencyMs = Date.now() - started;
    const decisionId = await record({
      input, result, offerId: null, authorizationId: null, orderId: null,
      balanceBeforePaise: null, policySnapshot: {},
    });
    await noteMisquote(input, code, null, null);
    return { outcome: "REFUSE", decisionId, code, reasons: result.reasons, details: verified.details };
  }

  const offer = verified.offer;
  const [auth] = await db.select().from(authorizations)
    .where(eq(authorizations.id, offer.row.authorizationId)).limit(1);
  const [item] = await db.select().from(catalogItems)
    .where(eq(catalogItems.sku, offer.row.sku)).limit(1);

  const bal = auth ? await balances(auth.id, auth.maxAmountPaise) : null;
  const ordersLastHour = await countRecentOrders(input.agentId, now);

  const policySnapshot = auth ? snapshotOf(auth) : {};
  const ctx: AdmissionContext = {
    now,
    agent: { id: agent.id, status: agent.status },
    offer: {
      id: offer.row.id,
      agentId: offer.row.agentId,
      authorizationId: offer.row.authorizationId,
      sku: offer.row.sku,
      category: item?.category ?? "",
      qty: offer.row.qty,
      unitPricePaise: offer.row.unitPricePaise,
      totalPaise: offer.row.totalPaise,
      expiresAt: offer.row.expiresAt,
      signatureValid: true,
      consumedAt: offer.row.consumedAt,
    },
    authorization: auth && bal ? {
      id: auth.id,
      status: auth.status,
      maxAmountPaise: auth.maxAmountPaise,
      maxPerOrderPaise: auth.maxPerOrderPaise,
      maxOrdersPerHour: auth.maxOrdersPerHour,
      allowedCategories: auth.allowedCategories,
      allowedSkus: auth.allowedSkus,
      expireAt: auth.expireAt,
      debitedPaise: bal.debitedPaise,
      heldPaise: bal.heldPaise,
    } : null,
    claimedTotalPaise: input.claimedTotalPaise ?? null,
    ordersLastHour,
    inventory: item?.inventory ?? 0,
    policySnapshot,
    policyVersion: 1,
  };

  const result = evaluate(ctx);
  result.latencyMs = Date.now() - started;

  if (result.outcome === "REFUSE") {
    const decisionId = await record({
      input, result, offerId: offer.row.id, authorizationId: auth?.id ?? null, orderId: null,
      balanceBeforePaise: bal?.availablePaise ?? null, policySnapshot,
    });
    const reason = result.reasons[0];
    await noteMisquote(input, reason?.code ?? null, offer.row.totalPaise, offer.row.id);
    return {
      outcome: "REFUSE",
      decisionId,
      code: reason?.code ?? "GUARD_UNAVAILABLE",
      reasons: result.reasons,
      details: { observed: reason?.observed, expected: reason?.expected },
    };
  }

  // From here money is involved, so the order row exists before anything is held or charged.
  const orderId = newId("order");
  await db.insert(orders).values({
    id: orderId,
    agentId: agent.id,
    authorizationId: offer.row.authorizationId,
    offerId: offer.row.id,
    idempotencyKey: input.idempotencyKey,
    amountPaise: offer.totalPaise,
    state: "ADMITTED",
  });
  await db.update(offers).set({ consumedAt: now }).where(eq(offers.id, offer.row.id));

  const decisionId = await record({
    input, result, offerId: offer.row.id, authorizationId: auth?.id ?? null, orderId,
    balanceBeforePaise: bal?.availablePaise ?? null, policySnapshot,
  });

  return result.outcome === "ESCALATE"
    ? escalate({ input, orderId, decisionId, offer, reasons: result.reasons })
    : admit({ input, orderId, decisionId, offer, auth: auth!, now });
}

interface BranchInput {
  input: PayInput;
  orderId: string;
  decisionId: string;
  offer: VerifiedOffer;
}

/**
 * ADMIT holds the money first. The gateway is the last thing touched, so a gateway outage cannot
 * leave a charge with no reservation behind it.
 */
async function admit(
  args: BranchInput & { auth: typeof authorizations.$inferSelect; now: Date },
): Promise<PayResult> {
  const { input, orderId, decisionId, offer, auth, now } = args;

  // reservation_id IS the order id: one hold per order, and the unique index on
  // (reservation_id, entry_type) then makes a double COMMIT impossible.
  const held = await reserve({
    authorizationId: auth.id,
    orderId,
    reservationId: orderId,
    amountPaise: offer.totalPaise,
    maxAmountPaise: auth.maxAmountPaise,
    expiresAt: new Date(now.getTime() + 15 * 60_000),
  });

  if (!held.ok) {
    await setOrderState({ orderId, next: "FAILED", failureReason: held.code });
    return {
      outcome: "REFUSE", decisionId, code: held.code,
      reasons: [{ code: held.code, rule: "ledger.reserve", message: messageFor(held.code), ...held.details }],
      details: held.details,
    };
  }

  await writeAudit({
    eventType: "RESERVE",
    actor: "guard",
    agentId: input.agentId,
    orderId,
    payload: { authorizationId: auth.id, amountPaise: offer.totalPaise.toString(), availableAfter: held.balances.availablePaise.toString() },
  });

  try {
    const gatewayOrder = await createOrder({
      orderId, amountPaise: offer.totalPaise, notes: { agent_id: input.agentId, offer_id: offer.row.id },
    });
    const link = await createPaymentLink({
      orderId,
      amountPaise: offer.totalPaise,
      description: `${offer.row.qty} x ${offer.row.sku}`,
      notes: { agent_id: input.agentId, offer_id: offer.row.id },
    });

    await getDb().update(orders)
      .set({ razorpayOrderId: gatewayOrder.id, razorpayPaymentLinkId: link.id, authorizationUrl: link.short_url })
      .where(eq(orders.id, orderId));
    await setOrderState({ orderId, next: "AWAITING_AUTHORIZATION" });

    await writeAudit({
      eventType: "AUTHORIZATION_URL_ISSUED",
      actor: "guard",
      agentId: input.agentId,
      orderId,
      payload: { razorpayOrderId: gatewayOrder.id, paymentLinkId: link.id },
    });

    return { outcome: "ADMIT", decisionId, orderId, amountPaise: offer.totalPaise, authorizationUrl: link.short_url, replayed: false };
  } catch (error) {
    return gatewayFailed(orderId, decisionId, error);
  }
}

/** ESCALATE holds nothing: the payment is outside this agent's authority, so a human decides. */
async function escalate(args: BranchInput & { reasons: Reason[] }): Promise<PayResult> {
  const { input, orderId, decisionId, offer, reasons } = args;
  try {
    const link = await createPaymentLink({
      orderId,
      amountPaise: offer.totalPaise,
      description: `Approval needed: ${offer.row.qty} x ${offer.row.sku}`,
      notes: { agent_id: input.agentId, offer_id: offer.row.id, escalated: "true" },
    });

    await getDb().update(orders)
      .set({ razorpayPaymentLinkId: link.id, authorizationUrl: link.short_url })
      .where(eq(orders.id, orderId));
    await setOrderState({ orderId, next: "ESCALATED" });

    return { outcome: "ESCALATE", decisionId, orderId, amountPaise: offer.totalPaise, paymentLink: link.short_url, reasons, replayed: false };
  } catch (error) {
    return gatewayFailed(orderId, decisionId, error);
  }
}

async function gatewayFailed(orderId: string, decisionId: string, error: unknown): Promise<PayResult> {
  const detail = error instanceof GatewayError ? error.message : String(error);
  await setOrderState({ orderId, next: "FAILED", failureReason: detail.slice(0, 500) });

  // Give the hold back. Without this a gateway outage silently eats the agent's headroom, and the
  // ESCALATE path never reserved, so release is a no-op there.
  const given = await release(orderId);
  if (given.applied) {
    await writeAudit({
      eventType: "RELEASE", actor: "guard", orderId,
      payload: { amountPaise: given.amountPaise.toString(), reason: "gateway failed" },
    });
  }

  await writeAudit({ eventType: "ORDER_FAILED", actor: "guard", orderId, payload: { reason: detail.slice(0, 500) } });
  return {
    outcome: "REFUSE", decisionId, code: "GATEWAY_UNAVAILABLE",
    reasons: [{ code: "GATEWAY_UNAVAILABLE", rule: "gateway", message: messageFor("GATEWAY_UNAVAILABLE") }],
    details: { detail: detail.slice(0, 200) },
  };
}

/** A replay returns the original outcome. ASPG failed closed here because it stored no bodies. */
function resume(order: typeof orders.$inferSelect, decisionId: string): PayResult {
  if (order.state === "ESCALATED") {
    return {
      outcome: "ESCALATE", decisionId, orderId: order.id, amountPaise: order.amountPaise,
      paymentLink: order.authorizationUrl ?? "", reasons: [], replayed: true,
    };
  }
  return {
    outcome: "ADMIT", decisionId, orderId: order.id, amountPaise: order.amountPaise,
    authorizationUrl: order.authorizationUrl ?? "", replayed: true,
  };
}

async function countRecentOrders(agentId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 3_600_000);
  const [row] = (await getDb().select({ n: sql<string>`count(*)::text` }).from(orders)
    .where(and(eq(orders.agentId, agentId), gte(orders.createdAt, since)))) as { n: string }[];
  return Number(row?.n ?? 0);
}

/** Screen 4. The agent's own words are kept verbatim — that is the evidence, not our summary. */
async function noteMisquote(
  input: PayInput,
  code: ErrorCode | null,
  signedPaise: bigint | null,
  offerId: string | null,
): Promise<void> {
  const kind = code === "MISQUOTE" ? "CLAIMED_TOTAL_MISMATCH"
    : code === "OFFER_SIGNATURE_INVALID" ? "TOKEN_TAMPERED"
    : code === "OFFER_EXPIRED" ? "TOKEN_EXPIRED"
    : code === "OFFER_WRONG_AGENT" ? "TOKEN_WRONG_AGENT"
    : code === "OFFER_ALREADY_USED" ? "TOKEN_REPLAYED"
    : null;
  if (!kind) return;

  await getDb().insert(misquoteEvents).values({
    id: newId("misquote"),
    agentId: input.agentId,
    offerId,
    kind,
    claimedPaise: input.claimedTotalPaise ?? null,
    signedPaise,
    rawAgentText: input.rawAgentText ?? null,
    source: input.source,
  });
}

/** The full policy, not a pointer. A foreign key is worthless in a dispute months later. */
function snapshotOf(auth: typeof authorizations.$inferSelect): Record<string, unknown> {
  return {
    authorizationId: auth.id,
    tokenType: auth.tokenType,
    frequency: auth.frequency,
    maxAmountPaise: auth.maxAmountPaise.toString(),
    maxPerOrderPaise: auth.maxPerOrderPaise.toString(),
    maxOrdersPerHour: auth.maxOrdersPerHour,
    allowedCategories: auth.allowedCategories,
    allowedSkus: auth.allowedSkus,
    expireAt: auth.expireAt.toISOString(),
    status: auth.status,
  };
}
