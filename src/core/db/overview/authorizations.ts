// Read model for /authorizations. Money is cast ::text and re-parsed so the driver cannot round it.
//
// NOTE for anyone reusing queries.ts#listAuthorizations: it has no WHERE clause, so it returns
// revoked mandates too. A caller that wants live mandates must filter. This one does.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { paiseFromSql } from "@/core/money";

export interface MandateRow {
  id: string;
  agentId: string;
  agentName: string;
  /** The mandate can be 'confirmed' while the AGENT is frozen. Filtering on status alone misses it. */
  agentStatus: "ACTIVE" | "FROZEN";
  frozenReason: string | null;
  principalRef: string;
  status: string;
  maxAmountPaise: bigint;
  debitedPaise: bigint;
  heldPaise: bigint;
  availablePaise: bigint;
  maxPerOrderPaise: bigint;
  maxOrdersPerHour: number;
  daysToExpiry: number;
  allowedCategories: string[];
  allowedSkus: string[];
  /** Active SKUs this mandate can actually reach, resolved the way the engine resolves scope. */
  reachSkus: number;
  scopedBy: "sku" | "category";
  expireAt: Date;
  grantedBy: string;
  grantedVia: string;
  grantedAt: Date;
  grantSignature: string;
  tokenType: string;
  frequency: string;
}

export interface MandateReason { code: string; n: number; escalates: boolean }

export interface AuthorizationsOverview {
  mandates: MandateRow[];
  /** Confirmed AND held by an active agent. Never a sum of ceilings — two people delegated these. */
  live: number;
  principals: number;
  /** The shared whole behind the reach bars: active SKUs at the merchants that issued a mandate. */
  catalogActive: number;
  reasons: MandateReason[];
}

type Row = Record<string, string | string[] | Date | number | null>;

/**
 * Everything the four summary cards and the mandate panel need, in three concurrent round trips.
 * Supabase latency dominates this page, so overlapping them is the whole cost difference.
 */
export async function authorizationsOverview(): Promise<AuthorizationsOverview> {
  const db = getDb();

  // Sequential, not Promise.all. Promise.all builds the array eagerly, so every statement
  // takes a pooled connection at once; holding several per request deadlocks the pool the
  // moment a few pages load together — the browser then shows a skeleton that never ends.
  const mandateRows = (await db.execute(sql`
      select
        a.id, a.status, a.expire_at, a.token_type, a.frequency,
        a.granted_by, a.granted_via, a.granted_at, a.grant_signature,
        a.allowed_categories, a.allowed_skus, a.max_orders_per_hour,
        a.max_amount_paise::text as max_amount,
        a.max_per_order_paise::text as max_per_order,
        ceil(extract(epoch from (a.expire_at - now())) / 86400)::text as days_left,
        g.id as agent_id, g.name as agent_name, g.status as agent_status,
        g.frozen_reason, g.principal_ref,
        coalesce(l.debited, 0)::text as debited,
        coalesce(l.reserved, 0)::text as reserved,
        coalesce(l.released, 0)::text as released,
        -- Same precedence as src/core/engine/rules.ts skuInScope: a non-empty SKU allowlist is the
        -- tighter grant and wins outright. Counting categories here would overstate the scope on
        -- the one card whose entire job is stating the scope.
        (select count(*) from catalog_items c
          where c.active and c.merchant_id = a.merchant_id
            and case when coalesce(array_length(a.allowed_skus, 1), 0) > 0
                     then c.sku = any(a.allowed_skus)
                     else c.category = any(a.allowed_categories) end)::text as reach
      from authorizations a
      join buyer_agents g on g.id = a.agent_id
      left join lateral (
        select
          sum(amount_paise) filter (where entry_type = 'COMMIT') as debited,
          sum(amount_paise) filter (where entry_type = 'RESERVE') as reserved,
          sum(amount_paise) filter (where entry_type = 'RELEASE') as released
        from authorization_ledger where authorization_id = a.id
      ) l on true
      where a.revoked_at is null
      order by a.created_at desc
    `)) as unknown as Row[];
  const totals = (await db.execute(sql`
      select
        (select count(*) from authorizations a join buyer_agents g on g.id = a.agent_id
          where a.status = 'confirmed' and g.status = 'ACTIVE' and a.revoked_at is null)::text as live,
        (select count(distinct g.principal_ref) from authorizations a join buyer_agents g on g.id = a.agent_id
          where a.status = 'confirmed' and g.status = 'ACTIVE' and a.revoked_at is null)::text as principals,
        (select count(*) from catalog_items c where c.active
           and c.merchant_id in (select merchant_id from authorizations))::text as catalog_active
    `)) as unknown as Record<string, string>[];
  // Scoped by rule namespace, not by decisions.authorization_id — that column is null on every
  // harness row, so a join would report zero refusals on a database full of them.
  const reasonRows = (await db.execute(sql`
      select reasons -> 0 ->> 'code' as code, count(*)::text as n,
             bool_or(outcome = 'ESCALATE') as escalates
      from decisions
      where reasons -> 0 ->> 'rule' like 'authorization.%'
      group by 1
      order by count(*) desc
      limit 6
    `)) as unknown as Record<string, string | boolean | null>[];

  const t = totals[0];

  return {
    mandates: mandateRows.map(toMandate),
    live: Number(t.live),
    principals: Number(t.principals),
    catalogActive: Number(t.catalog_active),
    reasons: reasonRows
      .filter((r) => r.code !== null)
      .map((r) => ({ code: String(r.code), n: Number(r.n), escalates: r.escalates === true })),
  };
}

function toMandate(r: Row): MandateRow {
  const debitedPaise = paiseFromSql(r.debited);
  const held = paiseFromSql(r.reserved) - debitedPaise - paiseFromSql(r.released);
  const heldPaise = held > 0n ? held : 0n;
  const maxAmountPaise = paiseFromSql(r.max_amount);
  const left = maxAmountPaise - debitedPaise - heldPaise;
  const allowedSkus = (r.allowed_skus as string[]) ?? [];

  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    agentName: String(r.agent_name),
    agentStatus: r.agent_status === "FROZEN" ? "FROZEN" : "ACTIVE",
    frozenReason: r.frozen_reason === null ? null : String(r.frozen_reason),
    principalRef: String(r.principal_ref),
    status: String(r.status),
    maxAmountPaise,
    debitedPaise,
    heldPaise,
    availablePaise: left > 0n ? left : 0n,
    maxPerOrderPaise: paiseFromSql(r.max_per_order),
    maxOrdersPerHour: Number(r.max_orders_per_hour),
    daysToExpiry: Number(r.days_left),
    allowedCategories: (r.allowed_categories as string[]) ?? [],
    allowedSkus,
    reachSkus: Number(r.reach),
    scopedBy: allowedSkus.length > 0 ? "sku" : "category",
    expireAt: new Date(r.expire_at as Date),
    grantedBy: String(r.granted_by),
    grantedVia: String(r.granted_via),
    grantedAt: new Date(r.granted_at as Date),
    grantSignature: String(r.grant_signature),
    tokenType: String(r.token_type),
    frequency: String(r.frequency),
  };
}
