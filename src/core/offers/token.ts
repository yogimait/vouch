// The offer payload and the checks that need no database. Money travels as strings: a number in
// JSON is a float in some parser somewhere.
import type { KeyObject } from "node:crypto";
import { decodeToken, encodeToken } from "@/core/crypto/token";

export const OFFER_TYP = "vouch.offer.v1";
export const OFFER_TTL_MS = 120_000;

export interface OfferPayload {
  typ: typeof OFFER_TYP;
  offer_id: string;
  merchant_id: string;
  agent_id: string;
  authorization_id: string;
  sku: string;
  qty: number;
  unit_price_paise: string;
  total_paise: string;
  currency: "INR";
  nonce: string;
  iat: string;
  exp: string;
}

export type OfferClaimFailure =
  | "OFFER_MALFORMED"
  | "OFFER_SIGNATURE_INVALID"
  | "OFFER_WRONG_TYPE"
  | "OFFER_EXPIRED"
  | "OFFER_WRONG_AGENT";

export type OfferClaimResult =
  | { ok: true; payload: OfferPayload }
  | { ok: false; failure: OfferClaimFailure };

export function signOffer(payload: OfferPayload, privateKey: KeyObject): string {
  return encodeToken(payload, privateKey);
}

/**
 * Pure checks, in the order that matters: signature, then shape, then `typ` before any other field
 * is read, then expiry, then the agent binding.
 */
export function readOfferToken(
  token: string,
  publicKey: KeyObject,
  callerAgentId: string,
  now: Date,
): OfferClaimResult {
  const decoded = decodeToken<OfferPayload>(token, publicKey);
  if (!decoded.ok) {
    return { ok: false, failure: decoded.failure === "MALFORMED" ? "OFFER_MALFORMED" : "OFFER_SIGNATURE_INVALID" };
  }

  const payload = decoded.payload;
  if (!payload || typeof payload !== "object") return { ok: false, failure: "OFFER_MALFORMED" };
  if (payload.typ !== OFFER_TYP) return { ok: false, failure: "OFFER_WRONG_TYPE" };

  const required: (keyof OfferPayload)[] = [
    "offer_id", "merchant_id", "agent_id", "authorization_id",
    "sku", "qty", "unit_price_paise", "total_paise", "currency", "nonce", "iat", "exp",
  ];
  if (required.some((key) => payload[key] === undefined || payload[key] === null)) {
    return { ok: false, failure: "OFFER_MALFORMED" };
  }

  const exp = Date.parse(payload.exp);
  if (Number.isNaN(exp)) return { ok: false, failure: "OFFER_MALFORMED" };
  if (exp <= now.getTime()) return { ok: false, failure: "OFFER_EXPIRED" };

  if (payload.agent_id !== callerAgentId) return { ok: false, failure: "OFFER_WRONG_AGENT" };

  return { ok: true, payload };
}
