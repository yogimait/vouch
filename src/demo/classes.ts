// The fourteen labelled violation classes, and the clean context every one of them mutates.
//
// Lives here rather than in scripts/ because the console runs the same fourteen. Two copies would
// let the page claim coverage the harness does not have.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { authorizations, buyerAgents, catalogItems } from "@/core/db/schema";
import type { AdmissionContext, Outcome } from "@/core/engine/types";
import type { ErrorCode } from "@/core/errors";

/** Fixed so a run is reproducible, and comfortably inside the seeded authorization's expiry. */
export const HARNESS_NOW = new Date("2026-08-25T12:00:00.000Z");

export interface Klass {
  label: string;
  /** Plain language, for the console. The label alone means nothing to someone reading it cold. */
  says: string;
  expect: Outcome;
  code: ErrorCode | null;
  mutate: (ctx: AdmissionContext, n: number) => void;
}

// One mutation each, applied to a context on which every rule otherwise passes. A test that changes
// two things at once cannot tell you which one fired.
export const CLASSES: Klass[] = [
  { label: "clean", says: "Everything in order.", expect: "ADMIT", code: null, mutate: () => {} },

  { label: "agent_frozen", says: "The agent has been frozen.", expect: "REFUSE", code: "AGENT_FROZEN",
    mutate: (c) => { c.agent.status = "FROZEN"; } },

  { label: "offer_signature_invalid", says: "The price was not signed by the merchant.", expect: "REFUSE", code: "OFFER_SIGNATURE_INVALID",
    mutate: (c) => { c.offer!.signatureValid = false; } },

  { label: "offer_expired", says: "The quote is stale.", expect: "REFUSE", code: "OFFER_EXPIRED",
    mutate: (c, n) => { c.offer!.expiresAt = new Date(c.now.getTime() - (n + 1) * 1000); } },

  { label: "offer_wrong_agent", says: "The quote was issued to a different agent.", expect: "REFUSE", code: "OFFER_WRONG_AGENT",
    mutate: (c, n) => { c.offer!.agentId = `agt_OTHER_${n}`; } },

  { label: "offer_replayed", says: "That quote has already been spent.", expect: "REFUSE", code: "OFFER_ALREADY_USED",
    mutate: (c, n) => { c.offer!.consumedAt = new Date(c.now.getTime() - n * 60_000); } },

  { label: "misquote", says: "The agent claimed a total the merchant never signed.", expect: "REFUSE", code: "MISQUOTE",
    mutate: (c, n) => { c.claimedTotalPaise = c.offer!.totalPaise - BigInt((n + 1) * 100); } },

  { label: "authorization_not_confirmed", says: "The human never confirmed the mandate.", expect: "REFUSE", code: "AUTHORIZATION_NOT_CONFIRMED",
    mutate: (c, n) => { c.authorization!.status = n % 2 === 0 ? "initiated" : "rejected"; } },

  { label: "authorization_expired", says: "The mandate has run out.", expect: "REFUSE", code: "AUTHORIZATION_EXPIRED",
    mutate: (c, n) => { c.authorization!.expireAt = new Date(c.now.getTime() - (n + 1) * 3600_000); } },

  { label: "sku_out_of_scope", says: "Furniture, on a mandate for peripherals.", expect: "REFUSE", code: "SKU_NOT_AUTHORIZED",
    mutate: (c) => { c.offer!.category = "furniture"; } },

  { label: "per_order_cap", says: "Legitimate, but over the per-order ceiling.", expect: "ESCALATE", code: "PER_ORDER_LIMIT_EXCEEDED",
    mutate: (c, n) => { c.offer!.totalPaise = c.authorization!.maxPerOrderPaise + BigInt((n + 1) * 100_00); } },

  { label: "headroom_exceeded", says: "Legitimate, but more than the mandate has left.", expect: "ESCALATE", code: "AUTHORIZATION_EXCEEDED",
    mutate: (c, n) => {
      // Under the per-order cap so the earlier rule cannot claim this one's credit.
      c.offer!.totalPaise = c.authorization!.maxPerOrderPaise;
      c.authorization!.debitedPaise = c.authorization!.maxAmountPaise - BigInt(n * 10_00);
    } },

  { label: "velocity", says: "Too many orders in one hour.", expect: "REFUSE", code: "VELOCITY_EXCEEDED",
    mutate: (c, n) => { c.ordersLastHour = c.authorization!.maxOrdersPerHour + n; } },

  { label: "out_of_stock", says: "More units than the merchant holds.", expect: "REFUSE", code: "OUT_OF_STOCK",
    mutate: (c, n) => { c.offer!.qty = c.inventory + 1 + n; } },
];

/** The context on which all thirteen rules pass. Read from the seed so it is never invented. */
export async function baseContext(): Promise<AdmissionContext> {
  const db = getDb();
  const [agent] = await db.select().from(buyerAgents).where(eq(buyerAgents.status, "ACTIVE")).limit(1);
  // Bound to that agent: there is more than one confirmed authorization, and a context pairing
  // one agent with another's mandate would fail offer.agentBinding for reasons nobody intended.
  const [auth] = await db.select().from(authorizations)
    .where(and(eq(authorizations.agentId, agent?.id ?? ""), eq(authorizations.status, "confirmed"))).limit(1);
  const [item] = await db.select().from(catalogItems).where(eq(catalogItems.sku, "SKU-A")).limit(1);
  if (!agent || !auth || !item) throw new Error("Run `npm run db:seed` first.");

  return {
    now: HARNESS_NOW,
    agent: { id: agent.id, status: agent.status },
    offer: {
      id: "off_HARNESS", agentId: agent.id, authorizationId: auth.id,
      sku: item.sku, category: item.category, qty: 1,
      unitPricePaise: item.listPricePaise, totalPaise: item.listPricePaise,
      expiresAt: new Date(HARNESS_NOW.getTime() + 120_000), signatureValid: true, consumedAt: null,
    },
    authorization: {
      id: auth.id, status: auth.status,
      maxAmountPaise: auth.maxAmountPaise, maxPerOrderPaise: auth.maxPerOrderPaise,
      maxOrdersPerHour: auth.maxOrdersPerHour,
      allowedCategories: auth.allowedCategories, allowedSkus: auth.allowedSkus,
      expireAt: auth.expireAt, debitedPaise: 0n, heldPaise: 0n,
    },
    claimedTotalPaise: null,
    ordersLastHour: 0,
    inventory: item.inventory,
    policySnapshot: { authorizationId: auth.id },
    policyVersion: 1,
  };
}

// Structured clone would carry the Dates but not the bigints in older runtimes, so the copy is
// explicit. Every attempt must start from an identical context or the run is not reproducible.
export function clone(base: AdmissionContext): AdmissionContext {
  return {
    ...base,
    agent: { ...base.agent },
    offer: { ...base.offer! },
    authorization: { ...base.authorization! },
  };
}
