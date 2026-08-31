// Writes are serialised by a Postgres advisory lock: the chain is one global row order, and two
// concurrent writers would fork it. That is a throughput ceiling, and it is the right trade here.
// ponytail: global lock. Per-merchant chains if this ever needs concurrency.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { auditLog } from "@/core/db/schema";
import { newId } from "@/core/ids";
import { buildAuditRow, computeRowHash, GENESIS_HASH } from "@/core/audit/chain";

export type AuditEventType =
  | "QUOTE_ISSUED"
  | "DECISION"
  | "MISQUOTE"
  | "RESERVE"
  | "GATEWAY_ORDER_CREATED"
  | "AUTHORIZATION_URL_ISSUED"
  | "WEBHOOK_RECEIVED"
  | "COMMIT"
  | "RELEASE"
  | "RECEIPT_ISSUED"
  | "ORDER_FAILED"
  | "ORDER_EXPIRED"
  | "SEED";

const AUDIT_CHAIN_LOCK = 7_402_000_001n;

export interface AuditWrite {
  eventType: AuditEventType;
  actor: string;
  payload: Record<string, unknown>;
  agentId?: string | null;
  orderId?: string | null;
}

export interface AuditWritten {
  id: string;
  seq: bigint;
  rowHash: string;
}

/** Awaited, never fire-and-forget: nothing may be signed against a decision that was not recorded. */
export async function writeAudit(entry: AuditWrite): Promise<AuditWritten> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK.toString()}::bigint)`);

    // Same aliasing trap as verifyChain: an output alias named `seq` would shadow the column and
    // sort the chain as text.
    const head = (await tx.execute(sql`
      select row_hash, seq::text as seq_text from audit_log order by seq desc limit 1
    `)) as unknown as Record<string, unknown>[];

    const prevHash = head.length ? String(head[0].row_hash) : GENESIS_HASH;
    const seq = head.length ? BigInt(String(head[0].seq_text)) + 1n : 1n;

    const row = buildAuditRow({
      agentId: entry.agentId ?? null,
      orderId: entry.orderId ?? null,
      eventType: entry.eventType,
      actor: entry.actor,
      payload: entry.payload,
      seq,
    });
    const rowHash = computeRowHash(prevHash, row);
    const id = newId("audit");

    await tx.insert(auditLog).values({
      id,
      agentId: row.agentId,
      orderId: row.orderId,
      eventType: row.eventType,
      actor: row.actor,
      payload: row.payload,
      prevHash,
      rowHash,
      seq,
    });

    return { id, seq, rowHash };
  });
}
