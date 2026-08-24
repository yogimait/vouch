// Issues a signed, merchant-bound price. The agent never supplies a price anywhere in the flow.
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "@/core/db";
import { catalogItems, offers } from "@/core/db/schema";
import { newId } from "@/core/ids";
import { signingKeys } from "@/core/crypto/keys";
import { writeAudit } from "@/core/audit/log";
import { OFFER_TTL_MS, OFFER_TYP, signOffer, type OfferPayload } from "@/core/offers/token";

export interface IssueOfferInput {
  merchantId: string;
  agentId: string;
  authorizationId: string;
  sku: string;
  qty: number;
  now?: Date;
}

export interface IssuedOffer {
  offerId: string;
  token: string;
  sku: string;
  qty: number;
  unitPricePaise: bigint;
  totalPaise: bigint;
  expiresAt: Date;
}

export type IssueOfferResult =
  | { ok: true; offer: IssuedOffer }
  | { ok: false; code: "OFFER_UNKNOWN" | "OUT_OF_STOCK"; details: Record<string, unknown> };

export async function issueOffer(input: IssueOfferInput): Promise<IssueOfferResult> {
  const now = input.now ?? new Date();
  const db = getDb();

  const [item] = await db.select().from(catalogItems).where(eq(catalogItems.sku, input.sku)).limit(1);
  if (!item || !item.active) return { ok: false, code: "OFFER_UNKNOWN", details: { sku: input.sku } };
  if (item.inventory < input.qty) {
    return { ok: false, code: "OUT_OF_STOCK", details: { observed: String(input.qty), expected: String(item.inventory) } };
  }

  const offerId = newId("offer");
  const nonce = ulid();
  const totalPaise = item.listPricePaise * BigInt(input.qty);
  const expiresAt = new Date(now.getTime() + OFFER_TTL_MS);

  const payload: OfferPayload = {
    typ: OFFER_TYP,
    offer_id: offerId,
    merchant_id: input.merchantId,
    agent_id: input.agentId,
    authorization_id: input.authorizationId,
    sku: item.sku,
    qty: input.qty,
    unit_price_paise: item.listPricePaise.toString(),
    total_paise: totalPaise.toString(),
    currency: "INR",
    nonce,
    iat: now.toISOString(),
    exp: expiresAt.toISOString(),
  };

  const token = signOffer(payload, signingKeys().privateKey);

  await db.insert(offers).values({
    id: offerId,
    merchantId: input.merchantId,
    agentId: input.agentId,
    authorizationId: input.authorizationId,
    sku: item.sku,
    qty: input.qty,
    unitPricePaise: item.listPricePaise,
    totalPaise,
    nonce,
    token,
    issuedAt: now,
    expiresAt,
  });

  await writeAudit({
    eventType: "QUOTE_ISSUED",
    actor: `agent:${input.agentId}`,
    agentId: input.agentId,
    payload: { offerId, sku: item.sku, qty: input.qty, totalPaise: totalPaise.toString(), expiresAt: expiresAt.toISOString() },
  });

  return {
    ok: true,
    offer: { offerId, token, sku: item.sku, qty: input.qty, unitPricePaise: item.listPricePaise, totalPaise, expiresAt },
  };
}
