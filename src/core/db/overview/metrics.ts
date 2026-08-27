// Everything /metrics draws, in three sequential round trips rather than nine. Three, not one, is
// the win here; issuing them at once is what the note in the body forbids.
// Money is cast ::text and re-parsed so the driver cannot round a bigint.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { paiseFromSql } from "@/core/money";

export interface SourceClock {
  source: string;
  n: number;
  admit: number;
  escalate: number;
  refuse: number;
  /** Microseconds, per source. The two sources time different work and are never summed. */
  p50Micros: number;
  p95Micros: number;
}

export interface ClassCount {
  label: string;
  n: number;
  refused: number;
  escalated: number;
  admitted: number;
}

export interface SettlementSnapshot {
  orders: number;
  admitted: number;
  awaitingAuthorization: number;
  escalated: number;
  paid: number;
  failed: number;
  expired: number;
  paidPaise: bigint;
  reservedPaise: bigint;
  debitedPaise: bigint;
  releasedPaise: bigint;
  heldPaise: bigint;
  receipts: number;
}

export interface MetricsOverview {
  sources: SourceClock[];
  classes: ClassCount[];
  settlement: SettlementSnapshot;
}

export async function metricsOverview(): Promise<MetricsOverview> {
  const db = getDb();

  // Sequential, not Promise.all. Promise.all builds the array eagerly, so every statement
  // takes a pooled connection at once; holding several per request deadlocks the pool the
  // moment a few pages load together — the browser then shows a skeleton that never ends.
  const sourceRows = (await db.execute(sql`
      select source, count(*)::text as n,
        count(*) filter (where outcome = 'ADMIT')::text as admit,
        count(*) filter (where outcome = 'ESCALATE')::text as escalate,
        count(*) filter (where outcome = 'REFUSE')::text as refuse,
        percentile_disc(0.5) within group (order by latency_ms)::text as p50,
        percentile_disc(0.95) within group (order by latency_ms)::text as p95
      from decisions group by source order by count(*) desc
    `)) as unknown as Record<string, string | null>[];
  // Only the harness writes a label, and only against the declared classes in @/demo/classes.
  const classRows = (await db.execute(sql`
      select label, count(*)::text as n,
        count(*) filter (where outcome = 'REFUSE')::text as refused,
        count(*) filter (where outcome = 'ESCALATE')::text as escalated,
        count(*) filter (where outcome = 'ADMIT')::text as admitted
      from decisions where source = 'harness' and label is not null
      group by label order by count(*) desc
    `)) as unknown as Record<string, string>[];
  const settlementRows = (await db.execute(sql`
      select
        count(*)::text as orders,
        count(*) filter (where state = 'ADMITTED')::text as admitted,
        count(*) filter (where state = 'AWAITING_AUTHORIZATION')::text as awaiting,
        count(*) filter (where state = 'ESCALATED')::text as escalated,
        count(*) filter (where state = 'PAID')::text as paid,
        count(*) filter (where state = 'FAILED')::text as failed,
        count(*) filter (where state = 'EXPIRED')::text as expired,
        coalesce(sum(amount_paise) filter (where state = 'PAID'), 0)::text as paid_paise,
        (select coalesce(sum(amount_paise) filter (where entry_type = 'RESERVE'), 0)::text
           from authorization_ledger) as reserved,
        (select coalesce(sum(amount_paise) filter (where entry_type = 'COMMIT'), 0)::text
           from authorization_ledger) as debited,
        (select coalesce(sum(amount_paise) filter (where entry_type = 'RELEASE'), 0)::text
           from authorization_ledger) as released,
        (select count(*)::text from receipts) as receipts
      from orders
    `)) as unknown as Record<string, string>[];

  const s = settlementRows[0];
  const reservedPaise = paiseFromSql(s.reserved);
  const debitedPaise = paiseFromSql(s.debited);
  const releasedPaise = paiseFromSql(s.released);
  // Same formula as core/ledger.ts readBalances: what is still held is what was never resolved.
  const held = reservedPaise - debitedPaise - releasedPaise;

  return {
    sources: sourceRows.map((r) => ({
      source: String(r.source),
      n: Number(r.n),
      admit: Number(r.admit),
      escalate: Number(r.escalate),
      refuse: Number(r.refuse),
      // latency_ms is milliseconds; the engine resolves under one, so the card reads microseconds.
      p50Micros: Number(r.p50 ?? 0) * 1000,
      p95Micros: Number(r.p95 ?? 0) * 1000,
    })),
    classes: classRows.map((r) => ({
      label: String(r.label),
      n: Number(r.n),
      refused: Number(r.refused),
      escalated: Number(r.escalated),
      admitted: Number(r.admitted),
    })),
    settlement: {
      orders: Number(s.orders),
      admitted: Number(s.admitted),
      awaitingAuthorization: Number(s.awaiting),
      escalated: Number(s.escalated),
      paid: Number(s.paid),
      failed: Number(s.failed),
      expired: Number(s.expired),
      paidPaise: paiseFromSql(s.paid_paise),
      reservedPaise,
      debitedPaise,
      releasedPaise,
      heldPaise: held > 0n ? held : 0n,
      receipts: Number(s.receipts),
    },
  };
}
