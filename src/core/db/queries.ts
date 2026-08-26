// Read models for the console. Money is cast ::text and re-parsed so the driver cannot round it.
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import {
  authorizationLedger, authorizations, buyerAgents, catalogItems, decisions, misquoteEvents,
  offers, orders, receipts,
} from "@/core/db/schema";
import { paiseFromSql } from "@/core/money";
import type { DecisionReason } from "@/core/db/schema";

export interface DecisionRow {
  id: string;
  createdAt: Date;
  agentName: string;
  agentId: string;
  sku: string | null;
  itemName: string | null;
  qty: number | null;
  amountPaise: bigint | null;
  outcome: "ADMIT" | "ESCALATE" | "REFUSE";
  reasons: DecisionReason[];
  matchedRules: string[];
  latencyMs: number;
  source: string;
  policyVersion: number;
  engineVersion: string;
}

export async function listDecisions(limit = 50): Promise<DecisionRow[]> {
  const rows = await getDb()
    .select({
      id: decisions.id,
      createdAt: decisions.createdAt,
      agentName: buyerAgents.name,
      agentId: decisions.agentId,
      sku: offers.sku,
      itemName: catalogItems.name,
      qty: offers.qty,
      amount: sql<string>`${offers.totalPaise}::text`,
      outcome: decisions.outcome,
      reasons: decisions.reasons,
      matchedRules: decisions.matchedRules,
      latencyMs: decisions.latencyMs,
      source: decisions.source,
      policyVersion: decisions.policyVersion,
      engineVersion: decisions.engineVersion,
    })
    .from(decisions)
    .leftJoin(buyerAgents, eq(decisions.agentId, buyerAgents.id))
    .leftJoin(offers, eq(decisions.offerId, offers.id))
    .leftJoin(catalogItems, eq(offers.sku, catalogItems.sku))
    .orderBy(desc(decisions.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    agentName: r.agentName ?? "unknown",
    amountPaise: r.amount === null ? null : paiseFromSql(r.amount),
  }));
}

export interface DecisionTotals { total: number; admit: number; escalate: number; refuse: number }

export async function decisionTotals(): Promise<DecisionTotals> {
  const [row] = (await getDb().execute(sql`
    select
      count(*)::text as total,
      count(*) filter (where outcome = 'ADMIT')::text as admit,
      count(*) filter (where outcome = 'ESCALATE')::text as escalate,
      count(*) filter (where outcome = 'REFUSE')::text as refuse
    from decisions
  `)) as unknown as Record<string, string>[];
  return {
    total: Number(row.total), admit: Number(row.admit),
    escalate: Number(row.escalate), refuse: Number(row.refuse),
  };
}

export interface AuthorizationView {
  id: string;
  agentName: string;
  principalRef: string;
  status: string;
  maxAmountPaise: bigint;
  debitedPaise: bigint;
  heldPaise: bigint;
  availablePaise: bigint;
  maxPerOrderPaise: bigint;
  maxOrdersPerHour: number;
  allowedCategories: string[];
  allowedSkus: string[];
  expireAt: Date;
  grantedBy: string;
  grantedVia: string;
  grantedAt: Date;
  grantSignature: string;
  tokenType: string;
  frequency: string;
}

/** Balances are derived here, never read from a column. A stored balance drifts. */
export async function listAuthorizations(): Promise<AuthorizationView[]> {
  const rows = await getDb()
    .select({
      a: authorizations,
      agentName: buyerAgents.name,
      principalRef: buyerAgents.principalRef,
      debited: sql<string>`coalesce(sum(${authorizationLedger.amountPaise}) filter (where ${authorizationLedger.entryType} = 'COMMIT'), 0)::text`,
      reserved: sql<string>`coalesce(sum(${authorizationLedger.amountPaise}) filter (where ${authorizationLedger.entryType} = 'RESERVE'), 0)::text`,
      released: sql<string>`coalesce(sum(${authorizationLedger.amountPaise}) filter (where ${authorizationLedger.entryType} = 'RELEASE'), 0)::text`,
    })
    .from(authorizations)
    .leftJoin(buyerAgents, eq(authorizations.agentId, buyerAgents.id))
    .leftJoin(authorizationLedger, eq(authorizationLedger.authorizationId, authorizations.id))
    .groupBy(authorizations.id, buyerAgents.name, buyerAgents.principalRef)
    .orderBy(desc(authorizations.createdAt));

  return rows.map(({ a, agentName, principalRef, debited, reserved, released }) => {
    const debitedPaise = paiseFromSql(debited);
    const heldPaise = paiseFromSql(reserved) - debitedPaise - paiseFromSql(released);
    const left = a.maxAmountPaise - debitedPaise - heldPaise;
    return {
      id: a.id,
      agentName: agentName ?? "unknown",
      principalRef: principalRef ?? "unknown",
      status: a.status,
      maxAmountPaise: a.maxAmountPaise,
      debitedPaise,
      heldPaise: heldPaise > 0n ? heldPaise : 0n,
      availablePaise: left > 0n ? left : 0n,
      maxPerOrderPaise: a.maxPerOrderPaise,
      maxOrdersPerHour: a.maxOrdersPerHour,
      allowedCategories: a.allowedCategories,
      allowedSkus: a.allowedSkus,
      expireAt: a.expireAt,
      grantedBy: a.grantedBy,
      grantedVia: a.grantedVia,
      grantedAt: a.grantedAt,
      grantSignature: a.grantSignature,
      tokenType: a.tokenType,
      frequency: a.frequency,
    };
  });
}

export interface ReceiptRow {
  id: string;
  orderId: string;
  sku: string;
  qty: number;
  amountPaise: bigint;
  agentName: string;
  outcome: string;
  signedAt: Date;
  razorpayPaymentId: string | null;
  blockHashes: Record<string, string>;
  body: string;
}

export async function listReceipts(limit = 50): Promise<ReceiptRow[]> {
  const rows = await getDb()
    .select({
      id: receipts.id,
      orderId: receipts.orderId,
      body: receipts.body,
      blockHashes: receipts.blockHashes,
      signedAt: receipts.signedAt,
      sku: offers.sku,
      qty: offers.qty,
      amount: sql<string>`${orders.amountPaise}::text`,
      agentName: buyerAgents.name,
      outcome: decisions.outcome,
      razorpayPaymentId: orders.razorpayPaymentId,
    })
    .from(receipts)
    .innerJoin(orders, eq(orders.id, receipts.orderId))
    .innerJoin(offers, eq(offers.id, orders.offerId))
    .leftJoin(buyerAgents, eq(buyerAgents.id, orders.agentId))
    .leftJoin(decisions, eq(decisions.orderId, orders.id))
    .orderBy(desc(receipts.signedAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    agentName: r.agentName ?? "unknown",
    outcome: r.outcome ?? "—",
    amountPaise: paiseFromSql(r.amount),
  }));
}

export interface MisquoteRow {
  id: string;
  createdAt: Date;
  agentName: string;
  kind: string;
  claimedPaise: bigint | null;
  signedPaise: bigint | null;
  claimedDiscountCode: string | null;
  rawAgentText: string | null;
  source: string;
}

/** Returned with `source` intact. The page splits on it; nothing here blends llm and harness. */
export async function listMisquotes(limit = 100): Promise<MisquoteRow[]> {
  const rows = await getDb()
    .select({
      id: misquoteEvents.id,
      createdAt: misquoteEvents.createdAt,
      agentName: buyerAgents.name,
      kind: misquoteEvents.kind,
      claimed: sql<string | null>`${misquoteEvents.claimedPaise}::text`,
      signed: sql<string | null>`${misquoteEvents.signedPaise}::text`,
      claimedDiscountCode: misquoteEvents.claimedDiscountCode,
      rawAgentText: misquoteEvents.rawAgentText,
      source: misquoteEvents.source,
    })
    .from(misquoteEvents)
    .leftJoin(buyerAgents, eq(buyerAgents.id, misquoteEvents.agentId))
    .orderBy(desc(misquoteEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    agentName: r.agentName ?? "unknown",
    claimedPaise: r.claimed === null ? null : paiseFromSql(r.claimed),
    signedPaise: r.signed === null ? null : paiseFromSql(r.signed),
  }));
}

export interface GateRow { source: string; label: string | null; outcome: string; n: number; p50Ms: number }
export interface SettlementTotals { attempted: number; paid: number; failed: number; debitedPaise: bigint; releasedPaise: bigint }

/** The gate ledger, grouped. Never joined to settlement — they answer different questions. */
export async function gateBreakdown(): Promise<GateRow[]> {
  const rows = (await getDb().execute(sql`
    select source, label, outcome, count(*)::text as n,
           coalesce(percentile_disc(0.5) within group (order by latency_ms), 0)::text as p50
    from decisions
    group by source, label, outcome
    order by source, label nulls first, outcome
  `)) as unknown as Record<string, string | null>[];

  return rows.map((r) => ({
    source: String(r.source),
    label: r.label,
    outcome: String(r.outcome),
    n: Number(r.n),
    p50Ms: Number(r.p50),
  }));
}

export async function settlementTotals(): Promise<SettlementTotals> {
  const [row] = (await getDb().execute(sql`
    select
      count(*)::text as attempted,
      count(*) filter (where state = 'PAID')::text as paid,
      count(*) filter (where state = 'FAILED')::text as failed,
      (select coalesce(sum(amount_paise) filter (where entry_type = 'COMMIT'), 0)::text from authorization_ledger) as debited,
      (select coalesce(sum(amount_paise) filter (where entry_type = 'RELEASE'), 0)::text from authorization_ledger) as released
    from orders
  `)) as unknown as Record<string, string>[];

  return {
    attempted: Number(row.attempted),
    paid: Number(row.paid),
    failed: Number(row.failed),
    debitedPaise: paiseFromSql(row.debited),
    releasedPaise: paiseFromSql(row.released),
  };
}

export interface LandingStats {
  decisions: number;
  stopped: number;
  receipts: number;
  /** Engine-only, and null when unmeasured. A landing page must not invent a latency. */
  p50Ms: number | null;
}

/** The four numbers on the front door, read from the same tables the console reads. */
export async function landingStats(): Promise<LandingStats> {
  const [row] = (await getDb().execute(sql`
    select
      (select count(*)::text from decisions) as decisions,
      (select count(*)::text from decisions where outcome <> 'ADMIT') as stopped,
      (select count(*)::text from receipts) as receipts,
      -- harness rows only. An 'http' decision times the database round trips that assemble its
      -- context as well as the engine, and putting that beside a microsecond claim would be the
      -- same conflation /metrics spends a paragraph warning about.
      (select percentile_disc(0.5) within group (order by latency_ms)::text
         from decisions where source = 'harness') as p50
  `)) as unknown as Record<string, string | null>[];

  return {
    decisions: Number(row.decisions),
    stopped: Number(row.stopped),
    receipts: Number(row.receipts),
    p50Ms: row.p50 === null ? null : Number(row.p50),
  };
}

export interface ReasonCount { code: string; n: number; escalates: boolean }
export interface SourceCount { source: string; n: number }

export interface DecisionsOverview {
  totals: DecisionTotals;
  reasons: ReasonCount[];
  sources: SourceCount[];
  /** Engine-only microseconds. The http rows time two database reads as well and are not comparable. */
  p50Micros: number | null;
  p95Micros: number | null;
  /** Newest first, oldest last, for a sparkline. Harness only, same reason as the percentiles. */
  recentLatencyMs: number[];
}

/**
 * Everything the console's four summary cards need, in three concurrent round trips rather than
 * seven sequential ones. The page is dominated by Supabase latency, so overlapping them is the
 * difference between 400ms and 1.2s.
 */
export async function decisionsOverview(): Promise<DecisionsOverview> {
  const db = getDb();

  // Sequential, not Promise.all. Promise.all builds the array eagerly, so every statement
  // takes a pooled connection at once; holding several per request deadlocks the pool the
  // moment a few pages load together — the browser then shows a skeleton that never ends.
  const totals = (await db.execute(sql`
      select
        count(*)::text as total,
        count(*) filter (where outcome = 'ADMIT')::text as admit,
        count(*) filter (where outcome = 'ESCALATE')::text as escalate,
        count(*) filter (where outcome = 'REFUSE')::text as refuse,
        (select percentile_disc(0.5) within group (order by latency_ms)::text
           from decisions where source = 'harness') as p50,
        (select percentile_disc(0.95) within group (order by latency_ms)::text
           from decisions where source = 'harness') as p95,
        (select coalesce(json_agg(l order by rn), '[]')::text from (
           select latency_ms as l, row_number() over (order by created_at desc) as rn
           from decisions where source = 'harness' order by created_at desc limit 24
         ) s) as recent
      from decisions
    `)) as unknown as Record<string, string | null>[];
  // The first reason is the one that fired: the engine is ordered first-match, so reasons[0]
  // names the rule that actually stopped the payment. Later entries are context, not the verdict.
  const reasonRows = (await db.execute(sql`
      select
        reasons -> 0 ->> 'code' as code,
        count(*)::text as n,
        bool_or(outcome = 'ESCALATE') as escalates
      from decisions
      where jsonb_array_length(reasons) > 0
      group by 1
      order by count(*) desc
      limit 6
    `)) as unknown as Record<string, string | boolean | null>[];
  const sourceRows = (await db.execute(sql`
      select source, count(*)::text as n from decisions group by source order by count(*) desc
    `)) as unknown as Record<string, string>[];

  const t = totals[0];
  const recent: number[] = JSON.parse(String(t.recent ?? "[]"));

  return {
    totals: {
      total: Number(t.total), admit: Number(t.admit),
      escalate: Number(t.escalate), refuse: Number(t.refuse),
    },
    reasons: reasonRows
      .filter((r) => r.code !== null)
      .map((r) => ({ code: String(r.code), n: Number(r.n), escalates: r.escalates === true })),
    sources: sourceRows.map((r) => ({ source: String(r.source), n: Number(r.n) })),
    // latency_ms is stored as milliseconds; the engine resolves well under one, so the card
    // reports microseconds and never rounds a real sub-millisecond decision down to "0ms".
    p50Micros: t.p50 === null ? null : Number(t.p50) * 1000,
    p95Micros: t.p95 === null ? null : Number(t.p95) * 1000,
    recentLatencyMs: recent,
  };
}

export interface LandingProof {
  /** The most recent refusal, with the numbers that produced it. Null on an unseeded database. */
  refusal: {
    code: string;
    message: string;
    observed: string | null;
    expected: string | null;
    sku: string | null;
    qty: number | null;
    totalPaise: bigint | null;
    agentName: string;
    latencyMs: number;
    at: Date;
  } | null;
  /** The newest signed receipt. Its body hash is the one thing on the landing page that decodes. */
  receipt: {
    id: string;
    orderId: string;
    bodyHash: string;
    keyId: string;
    amountPaise: bigint;
    merchantName: string;
    signedAt: Date;
  } | null;
  verdicts: { admit: number; escalate: number; refuse: number };
}

/**
 * The landing page states three things it cannot be allowed to invent: a refusal, a receipt, and the
 * split of verdicts. All three are read here so the front door and the console cannot disagree.
 */
export async function landingProof(): Promise<LandingProof> {
  const db = getDb();

  // Sequential, not Promise.all. Promise.all builds the array eagerly, so every statement
  // takes a pooled connection at once; holding several per request deadlocks the pool the
  // moment a few pages load together — the browser then shows a skeleton that never ends.
  const refusalRows = (await db.execute(sql`
      select d.reasons -> 0 ->> 'code' as code,
             d.reasons -> 0 ->> 'message' as message,
             d.reasons -> 0 ->> 'observed' as observed,
             d.reasons -> 0 ->> 'expected' as expected,
             o.sku, o.qty, o.total_paise::text as total,
             coalesce(b.name, 'an agent') as agent_name,
             d.latency_ms, d.created_at
      from decisions d
      left join offers o on o.id = d.offer_id
      left join buyer_agents b on b.id = d.agent_id
      where d.outcome = 'REFUSE' and jsonb_array_length(d.reasons) > 0
      order by d.created_at desc
      limit 1
    `)) as unknown as Record<string, string | number | Date | null>[];
  const receiptRows = (await db.execute(sql`
      select r.id, r.order_id, r.body_hash, r.key_id, r.signed_at,
             o.amount_paise::text as amount, m.name as merchant_name
      from receipts r
      join orders o on o.id = r.order_id
      join offers f on f.id = o.offer_id
      join merchants m on m.id = f.merchant_id
      order by r.signed_at desc
      limit 1
    `)) as unknown as Record<string, string | Date>[];
  const verdictRows = (await db.execute(sql`
      select count(*) filter (where outcome = 'ADMIT')::text as admit,
             count(*) filter (where outcome = 'ESCALATE')::text as escalate,
             count(*) filter (where outcome = 'REFUSE')::text as refuse
      from decisions
    `)) as unknown as Record<string, string>[];

  const d = refusalRows[0];
  const r = receiptRows[0];
  const v = verdictRows[0];

  return {
    refusal: d
      ? {
          code: String(d.code),
          message: String(d.message ?? ""),
          observed: d.observed === null ? null : String(d.observed),
          expected: d.expected === null ? null : String(d.expected),
          sku: d.sku === null ? null : String(d.sku),
          qty: d.qty === null ? null : Number(d.qty),
          totalPaise: d.total === null ? null : paiseFromSql(String(d.total)),
          agentName: String(d.agent_name),
          latencyMs: Number(d.latency_ms),
          at: new Date(String(d.created_at)),
        }
      : null,
    receipt: r
      ? {
          id: String(r.id),
          orderId: String(r.order_id),
          bodyHash: String(r.body_hash),
          keyId: String(r.key_id),
          amountPaise: paiseFromSql(String(r.amount)),
          merchantName: String(r.merchant_name),
          signedAt: new Date(String(r.signed_at)),
        }
      : null,
    verdicts: { admit: Number(v.admit), escalate: Number(v.escalate), refuse: Number(v.refuse) },
  };
}
