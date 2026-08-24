// Written before the verifier was called done. Every case here must FAIL to verify.
import { describe, expect, it } from "vitest";
import { generateKeyPair, privateKeyFromBase64, publicKeyFromBase64 } from "@/core/crypto/keys";
import { canonicalJson, base64url } from "@/core/canonical";
import { OFFER_TTL_MS, OFFER_TYP, readOfferToken, signOffer, type OfferPayload } from "@/core/offers/token";

const keys = generateKeyPair();
const priv = privateKeyFromBase64(keys.privateKey);
const pub = publicKeyFromBase64(keys.publicKey);
const other = generateKeyPair();

const NOW = new Date("2026-08-24T12:00:00.000Z");
const AGENT = "agt_01J9ZQ2V8K3MABCDEFGHJKMNPQ";

function makeOffer(overrides: Partial<OfferPayload> = {}): OfferPayload {
  return {
    typ: OFFER_TYP,
    offer_id: "off_01J9ZQ2V8K3MABCDEFGHJKMNPQ",
    merchant_id: "mrc_01J9ZQ2V8K3MABCDEFGHJKMNPQ",
    agent_id: AGENT,
    authorization_id: "auth_01J9ZQ2V8K3MABCDEFGHJKMN",
    sku: "SKU-A",
    qty: 3,
    unit_price_paise: "350000",
    total_paise: "1050000",
    currency: "INR",
    nonce: "01J9ZQ2V8K3MABCDEFGHJKMNPQ",
    iat: NOW.toISOString(),
    exp: new Date(NOW.getTime() + OFFER_TTL_MS).toISOString(),
    ...overrides,
  };
}

describe("offer token — the happy path", () => {
  it("round-trips and returns the exact payload", () => {
    const result = readOfferToken(signOffer(makeOffer(), priv), pub, AGENT, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.total_paise).toBe("1050000");
  });
});

describe("offer token — tamper suite", () => {
  it("rejects a flipped byte in the payload", () => {
    const token = signOffer(makeOffer(), priv);
    const [body, sig] = token.split(".");
    const bytes = Buffer.from(body, "base64url");
    bytes[10] ^= 0xff;
    const result = readOfferToken(`${base64url(bytes)}.${sig}`, pub, AGENT, NOW);
    expect(result).toEqual({ ok: false, failure: "OFFER_SIGNATURE_INVALID" });
  });

  it("rejects a re-signed payload from a different key", () => {
    const forged = signOffer(makeOffer({ total_paise: "1" }), privateKeyFromBase64(other.privateKey));
    expect(readOfferToken(forged, pub, AGENT, NOW)).toEqual({ ok: false, failure: "OFFER_SIGNATURE_INVALID" });
  });

  // The bug this whole file exists to prevent: verifying a re-serialisation instead of the bytes.
  it("rejects a payload edited and re-encoded with the original signature", () => {
    const original = makeOffer();
    const token = signOffer(original, priv);
    const sig = token.split(".")[1];
    const edited = { ...original, total_paise: "787500" };
    const reencoded = base64url(Buffer.from(canonicalJson(edited), "utf8"));
    expect(readOfferToken(`${reencoded}.${sig}`, pub, AGENT, NOW)).toEqual({
      ok: false, failure: "OFFER_SIGNATURE_INVALID",
    });
  });

  it("rejects a swapped signature from another valid token", () => {
    const a = signOffer(makeOffer(), priv);
    const b = signOffer(makeOffer({ offer_id: "off_01J9ZQ2V8K3MZZZZZZZZZZZZZZ" }), priv);
    expect(readOfferToken(`${a.split(".")[0]}.${b.split(".")[1]}`, pub, AGENT, NOW)).toEqual({
      ok: false, failure: "OFFER_SIGNATURE_INVALID",
    });
  });

  it("rejects an expired offer", () => {
    const token = signOffer(makeOffer(), priv);
    const later = new Date(NOW.getTime() + OFFER_TTL_MS + 1);
    expect(readOfferToken(token, pub, AGENT, later)).toEqual({ ok: false, failure: "OFFER_EXPIRED" });
  });

  it("rejects an offer issued to another agent", () => {
    const token = signOffer(makeOffer({ agent_id: "agt_01J9ZQ2V8K3MZZZZZZZZZZZZZZ" }), priv);
    expect(readOfferToken(token, pub, AGENT, NOW)).toEqual({ ok: false, failure: "OFFER_WRONG_AGENT" });
  });

  it("rejects a token that is validly signed but is not an offer", () => {
    const token = signOffer({ ...makeOffer(), typ: "vouch.receipt.v1" } as unknown as OfferPayload, priv);
    expect(readOfferToken(token, pub, AGENT, NOW)).toEqual({ ok: false, failure: "OFFER_WRONG_TYPE" });
  });

  it("rejects a validly signed payload with a field removed", () => {
    const partial = { ...makeOffer() };
    delete (partial as Partial<OfferPayload>).total_paise;
    const token = signOffer(partial as unknown as OfferPayload, priv);
    expect(readOfferToken(token, pub, AGENT, NOW)).toEqual({ ok: false, failure: "OFFER_MALFORMED" });
  });

  it.each([
    ["one segment", "abc"],
    ["three segments", "a.b.c"],
    ["empty signature", "abc."],
    ["empty body", ".abc"],
    ["empty string", ""],
  ])("rejects a malformed token: %s", (_name, token) => {
    expect(readOfferToken(token, pub, AGENT, NOW).ok).toBe(false);
  });
});

describe("canonicalJson", () => {
  it("is stable regardless of key insertion order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("does not let a re-ordered object change a signature", () => {
    const forward = signOffer(makeOffer(), priv);
    const reversed = Object.fromEntries(Object.entries(makeOffer()).reverse()) as OfferPayload;
    expect(signOffer(reversed, priv)).toBe(forward);
  });

  it("stringifies bigint rather than throwing", () => {
    expect(canonicalJson({ amount: 350000n })).toBe('{"amount":"350000"}');
  });
});
