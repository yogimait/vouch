// The receipt is the product. Six blocks, each hashed on its own, so a tamper report can say
// "the payment block was altered" instead of "signature invalid".
//
// It answers the four questions a dispute actually asks:
//   Q1 who delegated this authority   Q2 with what scope   Q3 what policy was in force
//   Q4 did the agent stay inside it
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import {
  authorizations, decisions, merchants, offers, orders, receipts, webhookEvents,
} from "@/core/db/schema";
import { canonicalJson } from "@/core/canonical";
import { signingKeys } from "@/core/crypto/keys";
import { newId } from "@/core/ids";
import { writeAudit } from "@/core/audit/log";
import { balances } from "@/core/ledger";
import { paiseFromSql } from "@/core/money";

export const RECEIPT_TYP = "vouch.receipt.v1";

export const BLOCK_NAMES = ["authorization", "policy", "offer", "decision", "payment", "audit"] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

export interface ReceiptBody {
  typ: typeof RECEIPT_TYP;
  receipt_id: string;
  order_id: string;
  issued_at: string;
  merchant: { id: string; name: string; legal_name: string };
  blocks: Record<BlockName, Record<string, unknown>>;
  block_hashes: Record<BlockName, string>;
}

export function hashBlock(block: unknown): string {
  return createHash("sha256").update(canonicalJson(block)).digest("hex");
}

export type BuildResult =
  | { ok: true; receiptId: string; body: string; signature: string; keyId: string; replayed: boolean }
  | { ok: false; code: "ORDER_UNKNOWN" | "ORDER_NOT_SETTLED" };

/** Called once an order reaches PAID. Idempotent — unique(order_id) on receipts is the backstop. */
export async function issueReceipt(orderId: string): Promise<BuildResult> {
  const db = getDb();

  const [existing] = await db.select().from(receipts).where(eq(receipts.orderId, orderId)).limit(1);
  if (existing) {
    return { ok: true, receiptId: existing.id, body: existing.body, signature: existing.signature, keyId: existing.keyId, replayed: true };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false, code: "ORDER_UNKNOWN" };
  if (order.state !== "PAID") return { ok: false, code: "ORDER_NOT_SETTLED" };

  const [offer] = await db.select().from(offers).where(eq(offers.id, order.offerId)).limit(1);
  const [auth] = await db.select().from(authorizations).where(eq(authorizations.id, order.authorizationId)).limit(1);
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, offer.merchantId)).limit(1);
  // Not filtered to ADMIT: an escalated order that a human paid has an ESCALATE decision, and that
  // is precisely what its receipt has to show — the agent was refused, a person overrode it.
  const [decision] = await db.select().from(decisions)
    .where(eq(decisions.orderId, orderId)).limit(1);
  const [hook] = await db.select().from(webhookEvents)
    .where(and(eq(webhookEvents.orderId, orderId), eq(webhookEvents.signatureVerified, true)))
    .orderBy(desc(webhookEvents.receivedAt)).limit(1);

  const after = await balances(auth.id, auth.maxAmountPaise);
  const range = await auditRange(orderId);

  const blocks: Record<BlockName, Record<string, unknown>> = {
    // Q1 and Q2: who delegated this, and how far it went.
    authorization: {
      authorization_id: auth.id,
      granted_by: auth.grantedBy,
      granted_via: auth.grantedVia,
      granted_at: auth.grantedAt.toISOString(),
      grant_signature: auth.grantSignature,
      token_type: auth.tokenType,
      frequency: auth.frequency,
      max_amount_paise: auth.maxAmountPaise.toString(),
      expire_at: auth.expireAt.toISOString(),
      status: auth.status,
    },
    // Q3: the policy as it was, embedded whole. A pointer is worthless in a dispute months later.
    policy: {
      policy_version: decision?.policyVersion ?? 1,
      engine_version: decision?.engineVersion ?? "",
      snapshot: decision?.policySnapshot ?? {},
    },
    // The merchant's own signed price, verbatim, so a third party can confirm what was offered.
    offer: {
      offer_id: offer.id,
      token: offer.token,
      sku: offer.sku,
      qty: offer.qty,
      unit_price_paise: offer.unitPricePaise.toString(),
      total_paise: offer.totalPaise.toString(),
      currency: offer.currency,
      issued_at: offer.issuedAt.toISOString(),
      expires_at: offer.expiresAt.toISOString(),
    },
    // Q4: the verdict, the rules that produced it, and what it cost the authorization.
    decision: {
      decision_id: decision?.id ?? null,
      outcome: decision?.outcome ?? null,
      matched_rules: decision?.matchedRules ?? [],
      reasons: decision?.reasons ?? [],
      latency_ms: decision?.latencyMs ?? 0,
      source: decision?.source ?? null,
      authorization_available_before_paise: decision?.authorizationBalanceBeforePaise?.toString() ?? null,
      authorization_available_after_paise: after.availablePaise.toString(),
      authorization_debited_after_paise: after.debitedPaise.toString(),
    },
    // Commits to the exact bytes Razorpay sent, not to our reading of them.
    payment: {
      razorpay_order_id: order.razorpayOrderId,
      razorpay_payment_id: order.razorpayPaymentId,
      razorpay_payment_link_id: order.razorpayPaymentLinkId,
      amount_paise: order.amountPaise.toString(),
      settled_at: order.settledAt?.toISOString() ?? null,
      webhook: hook
        ? { event: hook.event, raw_body_sha256: hook.rawBodySha256, signature_verified: hook.signatureVerified, received_at: hook.receivedAt.toISOString() }
        : { mode: "polled", raw_body_sha256: null, signature_verified: false },
    },
    // Anchors the receipt into the hash chain: this range, ending at this head.
    audit: range,
  };

  const receiptId = newId("receipt");
  const body: ReceiptBody = {
    typ: RECEIPT_TYP,
    receipt_id: receiptId,
    order_id: orderId,
    issued_at: new Date().toISOString(),
    merchant: { id: merchant.id, name: merchant.name, legal_name: merchant.legalName },
    blocks,
    block_hashes: Object.fromEntries(BLOCK_NAMES.map((n) => [n, hashBlock(blocks[n])])) as Record<BlockName, string>,
  };

  // Signed over these exact bytes, and stored as these exact bytes. jsonb would reorder keys and
  // normalise numbers, and the signature would stop matching its own receipt.
  const bodyText = canonicalJson(body);
  const keys = signingKeys();
  const { sign } = await import("node:crypto");
  const signature = sign(null, Buffer.from(bodyText, "utf8"), keys.privateKey).toString("base64url");
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");

  await db.insert(receipts).values({
    id: receiptId,
    orderId,
    body: bodyText,
    bodyHash,
    blockHashes: body.block_hashes,
    signature,
    keyId: keys.keyId,
    chainSeqFrom: range.seq_from === null ? null : BigInt(range.seq_from as string),
    chainSeqTo: range.seq_to === null ? null : BigInt(range.seq_to as string),
    chainHeadHash: (range.head_hash as string | null) ?? null,
  });

  await writeAudit({
    eventType: "RECEIPT_ISSUED",
    actor: "guard",
    orderId,
    payload: { receiptId, bodyHash, keyId: keys.keyId },
  });

  return { ok: true, receiptId, body: bodyText, signature, keyId: keys.keyId, replayed: false };
}

/** The chain rows this order produced, and the head they end at. */
async function auditRange(orderId: string): Promise<Record<string, unknown>> {
  const [row] = (await getDb().execute(sql`
    select min(seq)::text as seq_from, max(seq)::text as seq_to, count(*)::text as rows
    from audit_log where order_id = ${orderId}
  `)) as unknown as Record<string, string | null>[];

  const [head] = (await getDb().execute(sql`
    select row_hash from audit_log where order_id = ${orderId} order by seq desc limit 1
  `)) as unknown as { row_hash: string }[];

  return {
    seq_from: row?.seq_from ?? null,
    seq_to: row?.seq_to ?? null,
    rows: Number(paiseFromSql(row?.rows ?? "0")),
    head_hash: head?.row_hash ?? null,
  };
}
