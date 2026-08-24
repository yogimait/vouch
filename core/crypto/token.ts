// Two-segment token: base64url(canonicalJson(payload)) "." base64url(ed25519 signature).
// No header segment, so there is no algorithm to negotiate and no alg:none to defend against.
import { sign, verify, type KeyObject } from "node:crypto";
import { base64url, canonicalBytes, fromBase64url } from "@/core/canonical";

export function encodeToken(payload: unknown, privateKey: KeyObject): string {
  const body = canonicalBytes(payload);
  const signature = sign(null, body, privateKey);
  return `${base64url(body)}.${base64url(signature)}`;
}

export type DecodeFailure =
  | "MALFORMED"
  | "SIGNATURE_INVALID";

export type DecodeResult<T> =
  | { ok: true; payload: T }
  | { ok: false; failure: DecodeFailure };

/**
 * Verifies over the RECEIVED bytes, never over a re-serialisation of the parsed object.
 * Re-serialising first is the subtle bug that makes tamper detection silently useless.
 */
export function decodeToken<T>(token: string, publicKey: KeyObject): DecodeResult<T> {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, failure: "MALFORMED" };

  let body: Buffer;
  let signature: Buffer;
  try {
    body = fromBase64url(parts[0]);
    signature = fromBase64url(parts[1]);
  } catch {
    return { ok: false, failure: "MALFORMED" };
  }
  if (body.length === 0 || signature.length === 0) return { ok: false, failure: "MALFORMED" };

  let signatureOk: boolean;
  try {
    signatureOk = verify(null, body, publicKey, signature);
  } catch {
    return { ok: false, failure: "SIGNATURE_INVALID" };
  }
  if (!signatureOk) return { ok: false, failure: "SIGNATURE_INVALID" };

  try {
    return { ok: true, payload: JSON.parse(body.toString("utf8")) as T };
  } catch {
    return { ok: false, failure: "MALFORMED" };
  }
}
