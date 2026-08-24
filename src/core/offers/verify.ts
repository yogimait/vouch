// Full verification: the pure claim checks, then the three the database has to answer.
// Steps 6-8 are belt and braces — even if the signature scheme were broken, the price still has to
// match a row the merchant wrote.
import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { catalogItems, offers } from "@/core/db/schema";
import { signingKeys } from "@/core/crypto/keys";
import { readOfferToken, type OfferClaimFailure, type OfferPayload } from "@/core/offers/token";

export type OfferFailure =
  | OfferClaimFailure
  | "OFFER_UNKNOWN"
  | "OFFER_ALREADY_USED"
  | "OFFER_TAMPERED";

export interface VerifiedOffer {
  payload: OfferPayload;
  row: typeof offers.$inferSelect;
  totalPaise: bigint;
  unitPricePaise: bigint;
}

export type VerifyOfferResult =
  | { ok: true; offer: VerifiedOffer }
  | { ok: false; failure: OfferFailure; details: Record<string, unknown> };

export async function verifyOffer(
  token: string,
  callerAgentId: string,
  now: Date = new Date(),
): Promise<VerifyOfferResult> {
  const claims = readOfferToken(token, signingKeys().publicKey, callerAgentId, now);
  if (!claims.ok) return { ok: false, failure: claims.failure, details: {} };

  const payload = claims.payload;
  const db = getDb();

  const [row] = await db.select().from(offers).where(eq(offers.id, payload.offer_id)).limit(1);
  if (!row) return { ok: false, failure: "OFFER_UNKNOWN", details: { offerId: payload.offer_id } };

  // A valid signature over a payload we never issued would still be a forgery of our key.
  if (row.token !== token) {
    return { ok: false, failure: "OFFER_TAMPERED", details: { offerId: payload.offer_id } };
  }
  if (row.consumedAt) {
    return { ok: false, failure: "OFFER_ALREADY_USED", details: { offerId: row.id, consumedAt: row.consumedAt.toISOString() } };
  }

  const [item] = await db.select().from(catalogItems).where(eq(catalogItems.sku, row.sku)).limit(1);
  const expectedTotal = (item?.listPricePaise ?? 0n) * BigInt(row.qty);
  if (!item || expectedTotal !== row.totalPaise) {
    return {
      ok: false,
      failure: "OFFER_TAMPERED",
      details: { observed: row.totalPaise.toString(), expected: expectedTotal.toString() },
    };
  }

  return { ok: true, offer: { payload, row, totalPaise: row.totalPaise, unitPricePaise: row.unitPricePaise } };
}
