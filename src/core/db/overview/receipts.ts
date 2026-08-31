// The /receipts summary. Money is cast ::text and re-parsed so the driver cannot round it.
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { signingKeys } from "@/core/crypto/keys";
import { receipts } from "@/core/db/schema";
import { paiseFromSql } from "@/core/money";
import { BLOCK_NAMES, type BlockName } from "@/core/receipts/build";
import { verifyBundle } from "@/core/receipts/verify";

// Twelve Ed25519 verifications plus their block hashes cost about a millisecond. Fifty would cost
// more than the query, on the page whose whole argument is that checking evidence is cheap.
const SAMPLE = 12;

export interface ReceiptsOverview {
  receipts: number;
  /** Settled orders. The two bar values are shares of this and of nothing else. */
  paid: number;
  receipted: number;
  awaiting: number;
  /** Disjoint from paid — a failed order never reaches a receipt. Never bar it against the others. */
  failed: number;
  anchored: number;
  receiptedPaise: bigint;
  blocks: { name: BlockName; n: number }[];
  byAgent: { agent: string; paise: bigint }[];
  /** Re-checked on this request: signature and block hashes, newest first. No audit-chain walk. */
  verified: { checked: number; valid: number };
}

/**
 * Everything the four summary cards need, in four sequential round trips. They ran concurrently
 * once; the note in the body is the reason they no longer do.
 */
export async function receiptsOverview(): Promise<ReceiptsOverview> {
  const db = getDb();

  // Sequential, not Promise.all. Promise.all builds the array eagerly, so every statement
  // takes a pooled connection at once; holding several per request deadlocks the pool the
  // moment a few pages load together — the browser then shows a skeleton that never ends.
  const totals = (await db.execute(sql`
      select
        count(*) filter (where o.state = 'PAID')::text as paid,
        count(*) filter (where o.state = 'PAID' and r.id is not null)::text as receipted,
        count(*) filter (where o.state = 'FAILED')::text as failed,
        count(r.id)::text as receipts,
        count(*) filter (where r.chain_seq_from is not null)::text as anchored,
        coalesce(sum(o.amount_paise) filter (where r.id is not null), 0)::text as receipted_paise
      from orders o
      left join receipts r on r.order_id = o.id
    `)) as unknown as Record<string, string>[];
  // Every receipt carries all six, so equal bars are the honest reading — and a short one names
  // the block a build dropped, which is exactly what this card exists to catch.
  const blockRows = (await db.execute(sql`
      select k as block, count(*)::text as n
      from receipts, jsonb_object_keys(block_hashes) k
      group by k
    `)) as unknown as Record<string, string>[];
  const agentRows = (await db.execute(sql`
      select a.name as agent, sum(o.amount_paise)::text as paise
      from receipts r
      join orders o on o.id = r.order_id
      join buyer_agents a on a.id = o.agent_id
      group by a.name
      order by sum(o.amount_paise) desc
      limit 4
    `)) as unknown as Record<string, string>[];
  const sample = await db.select({ body: receipts.body, signature: receipts.signature, keyId: receipts.keyId })
      .from(receipts).orderBy(desc(receipts.signedAt)).limit(SAMPLE);

  const t = totals[0];
  // signingKeys() rather than `?? ""`: an unset key made this page report 0 of N receipts valid,
  // which is a tamper alarm raised by a missing environment variable.
  const publicKey = signingKeys().publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const present = new Map(blockRows.map((r) => [String(r.block), Number(r.n)]));

  return {
    receipts: Number(t.receipts),
    paid: Number(t.paid),
    receipted: Number(t.receipted),
    awaiting: Number(t.paid) - Number(t.receipted),
    failed: Number(t.failed),
    anchored: Number(t.anchored),
    receiptedPaise: paiseFromSql(t.receipted_paise),
    blocks: BLOCK_NAMES.map((name) => ({ name, n: present.get(name) ?? 0 })),
    byAgent: agentRows.map((r) => ({ agent: String(r.agent), paise: paiseFromSql(r.paise) })),
    verified: {
      checked: sample.length,
      valid: sample.filter((r) => verifyBundle({
        receipt: r.body, signature: r.signature, key_id: r.keyId, public_key: publicKey,
      }).valid).length,
    },
  };
}
