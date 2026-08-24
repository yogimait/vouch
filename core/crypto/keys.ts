// Ed25519 via node:crypto. No JWT library: there is exactly one algorithm here, so a header
// carrying `alg` would only add the alg:none attack surface.
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";

export interface KeyPairBase64 {
  privateKey: string;
  publicKey: string;
}

/** Used by scripts/keygen.ts. DER is compact and unambiguous; PEM would carry newlines into .env. */
export function generateKeyPair(): KeyPairBase64 {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

export function privateKeyFromBase64(base64: string): KeyObject {
  return createPrivateKey({ key: Buffer.from(base64, "base64"), format: "der", type: "pkcs8" });
}

export function publicKeyFromBase64(base64: string): KeyObject {
  return createPublicKey({ key: Buffer.from(base64, "base64"), format: "der", type: "spki" });
}

let cachedPrivate: KeyObject | undefined;
let cachedPublic: KeyObject | undefined;

export function signingKeys(): { privateKey: KeyObject; publicKey: KeyObject; keyId: string } {
  const priv = process.env.VOUCH_SIGNING_PRIVATE_KEY;
  const pub = process.env.VOUCH_SIGNING_PUBLIC_KEY;
  if (!priv || !pub) throw new Error("VOUCH_SIGNING_PRIVATE_KEY / _PUBLIC_KEY are not set. Run: npm run keygen");

  cachedPrivate ??= privateKeyFromBase64(priv);
  cachedPublic ??= publicKeyFromBase64(pub);
  return { privateKey: cachedPrivate, publicKey: cachedPublic, keyId: process.env.VOUCH_SIGNING_KEY_ID ?? "vouch-k1" };
}
