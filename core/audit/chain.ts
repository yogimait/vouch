// Tamper evidence without a blockchain: rowHash = sha256(prevHash + canonicalJson(row)).
// Editing any historical row breaks every hash after it, which verifyChain locates.
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { canonicalJson } from "@/core/canonical";

export const GENESIS_HASH = "0".repeat(64);

export interface AuditRowInput {
  agentId: string | null;
  orderId: string | null;
  eventType: string;
  actor: string;
  payload: Record<string, unknown>;
  seq: bigint;
}

/** The exact key set that is hashed. Both the writer and the verifier build the row through this. */
export function buildAuditRow(input: AuditRowInput): AuditRowInput {
  return {
    agentId: input.agentId ?? null,
    orderId: input.orderId ?? null,
    eventType: input.eventType,
    actor: input.actor,
    payload: input.payload,
    seq: input.seq,
  };
}

export function computeRowHash(prevHash: string, row: AuditRowInput): string {
  return createHash("sha256").update(prevHash + canonicalJson(row)).digest("hex");
}

export interface ChainVerification {
  valid: boolean;
  rowsChecked: number;
  brokenAt: string | null;
  headHash: string;
}

/** fromSeq lets a receipt verify only the range it commits to. */
export async function verifyChain(fromSeq?: bigint, toSeq?: bigint): Promise<ChainVerification> {
  const { getDb } = await import("@/core/db");

  // seq is aliased away from its own name: an output alias wins in ORDER BY, and ordering the chain
  // as text would walk it 1, 10, 11, 2 and report a perfectly good chain as broken.
  const rows = (await getDb().execute(sql`
    select id, agent_id, order_id, event_type, actor, payload, prev_hash, row_hash, seq::text as seq_text
    from audit_log
    ${fromSeq === undefined ? sql`` : sql`where seq >= ${fromSeq.toString()}::bigint`}
    ${toSeq === undefined ? sql`` : sql`and seq <= ${toSeq.toString()}::bigint`}
    order by seq asc
  `)) as unknown as Record<string, unknown>[];

  // A partial range starts from its predecessor's hash, not from genesis.
  let expectedPrevHash = fromSeq === undefined || rows.length === 0
    ? GENESIS_HASH
    : String(rows[0].prev_hash);
  let rowsChecked = 0;

  for (const stored of rows) {
    const row = buildAuditRow({
      agentId: (stored.agent_id as string | null) ?? null,
      orderId: (stored.order_id as string | null) ?? null,
      eventType: String(stored.event_type),
      actor: String(stored.actor),
      payload: stored.payload as Record<string, unknown>,
      seq: BigInt(String(stored.seq_text)),
    });

    const brokeLink = String(stored.prev_hash) !== expectedPrevHash;
    const brokeRow = computeRowHash(expectedPrevHash, row) !== String(stored.row_hash);

    if (brokeLink || brokeRow) {
      return { valid: false, rowsChecked, brokenAt: String(stored.id), headHash: expectedPrevHash };
    }

    expectedPrevHash = String(stored.row_hash);
    rowsChecked += 1;
  }

  return { valid: true, rowsChecked, brokenAt: null, headHash: expectedPrevHash };
}
