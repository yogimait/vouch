// Prints the signing keypair as .env.local lines. Ed25519, DER base64 — no newlines to escape.
import { generateKeyPair } from "@/core/crypto/keys";

const { privateKey, publicKey } = generateKeyPair();

console.log(`VOUCH_SIGNING_PRIVATE_KEY="${privateKey}"`);
console.log(`VOUCH_SIGNING_PUBLIC_KEY="${publicKey}"`);
console.log(`VOUCH_SIGNING_KEY_ID="vouch-k1"`);
console.error("\nPaste these into .env.local. The public key also goes in the README so a third party can verify a receipt.");
