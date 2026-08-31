// Verification a third party can run with nothing but the bundle and the public key.
// Per-block hashes turn "signature invalid" into "the payment block was altered" — the difference
// between a check that is convincing on camera and one that is not.
import { verify as verifySignature } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { receipts } from "@/core/db/schema";
import { publicKeyFromBase64, signingKeys } from "@/core/crypto/keys";
import { verifyChain } from "@/core/audit/chain";
import { BLOCK_NAMES, hashBlock, RECEIPT_TYP, type BlockName, type ReceiptBody } from "@/core/receipts/build";

export interface Bundle {
  receipt: string;
  signature: string;
  key_id: string;
  public_key: string;
}

export interface Verification {
  valid: boolean;
  signatureValid: boolean;
  /** Named blocks whose contents no longer match the hash the signature covers. */
  tamperedBlocks: BlockName[];
  malformed: boolean;
  chain?: { valid: boolean; rowsChecked: number; brokenAt: string | null };
}

/**
 * Verifies over the RECEIVED bytes. Parsing first and re-serialising would silently repair
 * whitespace and key order, and every tamper test would pass for the wrong reason.
 */
export function verifyBundle(bundle: Bundle): Verification {
  const bytes = Buffer.from(bundle.receipt, "utf8");

  let signatureValid = false;
  try {
    signatureValid = verifySignature(
      null, bytes, publicKeyFromBase64(bundle.public_key), Buffer.from(bundle.signature, "base64url"),
    );
  } catch {
    signatureValid = false;
  }

  let body: ReceiptBody;
  try {
    body = JSON.parse(bundle.receipt) as ReceiptBody;
  } catch {
    return { valid: false, signatureValid, tamperedBlocks: [], malformed: true };
  }

  if (body.typ !== RECEIPT_TYP || !body.blocks || !body.block_hashes) {
    return { valid: false, signatureValid, tamperedBlocks: [], malformed: true };
  }

  const tamperedBlocks = BLOCK_NAMES.filter((name) => hashBlock(body.blocks[name]) !== body.block_hashes[name]);

  return {
    valid: signatureValid && tamperedBlocks.length === 0,
    signatureValid,
    tamperedBlocks,
    malformed: false,
  };
}

export type LoadResult =
  | { ok: true; bundle: Bundle; verification: Verification }
  | { ok: false; code: "RECEIPT_UNKNOWN" };

type Row = typeof receipts.$inferSelect;

async function loadRow(orderId: string): Promise<Row | undefined> {
  const [row] = await getDb().select().from(receipts).where(eq(receipts.orderId, orderId)).limit(1);
  return row;
}

/** The public key travels with the bundle so verification needs nothing from us but the file. */
function bundleOf(row: Row): Extract<LoadResult, { ok: true }> {
  // signingKeys() throws when the key is absent. The `?? ""` this replaces made
  // publicKeyFromBase64 throw further in, where it was caught and reported as signatureValid:false
  // -- a missing environment variable and a forged receipt looked identical on the one screen the
  // whole product rests on.
  const publicKey = signingKeys().publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const bundle: Bundle = { receipt: row.body, signature: row.signature, key_id: row.keyId, public_key: publicKey };
  return { ok: true, bundle, verification: verifyBundle(bundle) };
}

export async function exportBundle(orderId: string): Promise<LoadResult> {
  const row = await loadRow(orderId);
  return row ? bundleOf(row) : { ok: false, code: "RECEIPT_UNKNOWN" };
}

/** The full check, including walking the audit range the receipt commits to. One row read, not two. */
export async function verifyStored(orderId: string): Promise<LoadResult> {
  const row = await loadRow(orderId);
  if (!row) return { ok: false, code: "RECEIPT_UNKNOWN" };

  const loaded = bundleOf(row);
  if (row.chainSeqFrom !== null && row.chainSeqTo !== null) {
    const chain = await verifyChain(row.chainSeqFrom, row.chainSeqTo);
    loaded.verification.chain = { valid: chain.valid, rowsChecked: chain.rowsChecked, brokenAt: chain.brokenAt };
    loaded.verification.valid &&= chain.valid;
  }
  return loaded;
}
