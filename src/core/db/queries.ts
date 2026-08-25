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
