// Verification a third party can run with nothing but the bundle and the public key.
// Per-block hashes turn "signature invalid" into "the payment block was altered" — the difference
// between a check that is convincing on camera and one that is not.
import { verify as verifySignature } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { receipts } from "@/core/db/schema";
import { publicKeyFromBase64, signingKeys } from "@/core/crypto/keys";
import { verifyChain } from "@/core/audit/chain";
import { BLOCK_NAMES, hashBlock, issueReceipt, RECEIPT_TYP, type BlockName, type ReceiptBody } from "@/core/receipts/build";

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

/**
 * The row, and the one place a missing one is repaired.
 *
 * settleOrder swallows a receipt failure on purpose -- Razorpay retries non-2xx and the money is
 * already committed by then -- and its comment has always claimed the receipt could be re-issued on
 * read. Nothing did. One transient failure at settlement meant a PAID order answered 404 forever,
 * which is the exact counterexample to "every paid order emits a receipt", and it also deadlocked
 * the /live shelf waiting on that delivery.
 *
 * Repaired here rather than in each caller because both doors -- the API through exportBundle and
 * the console page through verifyStored -- come through this function. issueReceipt returns the
 * existing row before touching anything and has receipts_order_unique behind it, so calling it on a
 * miss is safe; for an order that is not PAID it declines and the miss simply stands.
 */
async function loadRow(orderId: string): Promise<Row | undefined> {
  const read = async () => {
    const [row] = await getDb().select().from(receipts).where(eq(receipts.orderId, orderId)).limit(1);
    return row;
  };

  const row = await read();
  if (row) return row;

  // Caught, then re-read. Two callers can miss the select at the same time -- demo 4 hit exactly
  // that, reading a moment before the webhook's own issue committed -- and the loser of that race
  // trips receipts_order_unique. The row it wanted exists by then, so the insert failing is not the
  // same thing as there being no receipt, and it must not surface as a 500.
  try {
    const issued = await issueReceipt(orderId);
    if (!issued.ok) return undefined;
  } catch (error) {
    console.error(`[receipt] re-issue for ${orderId}`, error);
  }
  return await read();
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
