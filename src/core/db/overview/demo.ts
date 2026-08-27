// The stage the demo is set on: what is delegated, what is on the shelf, what the gate has already
// ruled, and what actually moved. Four round trips, issued one at a time — see the note in the
// body. They were concurrent, and concurrency at this layer is what exhausted the pool.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import {
  decisionTotals, settlementTotals, type DecisionTotals, type SettlementTotals,
} from "@/core/db/queries";
import { paiseFromSql } from "@/core/money";

export interface MandateView {
  agentName: string;
  principalRef: string;
  maxAmountPaise: bigint;
  debitedPaise: bigint;
  heldPaise: bigint;
  availablePaise: bigint;
  maxPerOrderPaise: bigint;
}

export interface ShelfView {
  active: number;
  outOfStock: number;
  /** Partitions `active`, so the bars over it share one denominator. */
  categories: { name: string; n: number }[];
}

export interface DemoOverview {
  /** Null when no live mandate exists — the page says so rather than showing some other row. */
  mandate: MandateView | null;
  shelf: ShelfView;
  gate: DecisionTotals;
  settlement: SettlementTotals;
}

export async function demoOverview(): Promise<DemoOverview> {
  const db = getDb();

  // Sequential, not Promise.all. Promise.all builds the array eagerly, so every statement
  // takes a pooled connection at once; holding several per request deadlocks the pool the
  // moment a few pages load together — the browser then shows a skeleton that never ends.
  // A rejected, revoked, expired or frozen-agent block is not the mandate the demo spends
  // against. Filtering here is why the page cannot narrate against the wrong row.
  const mandateRows = (await db.execute(sql`
      select
        ag.name as agent_name,
        ag.principal_ref,
        a.max_amount_paise::text as max_amount,
        a.max_per_order_paise::text as max_per_order,
        coalesce(sum(l.amount_paise) filter (where l.entry_type = 'COMMIT'), 0)::text as debited,
        coalesce(sum(l.amount_paise) filter (where l.entry_type = 'RESERVE'), 0)::text as reserved,
        coalesce(sum(l.amount_paise) filter (where l.entry_type = 'RELEASE'), 0)::text as released
      from authorizations a
      join buyer_agents ag on ag.id = a.agent_id
      left join authorization_ledger l on l.authorization_id = a.id
      where a.status = 'confirmed'
        and ag.status = 'ACTIVE'
        and a.revoked_at is null
        and a.expire_at > now()
      group by a.id, ag.name, ag.principal_ref
      order by a.created_at desc
      limit 1
  `)) as unknown as Record<string, string>[];

  const shelfRows = (await db.execute(sql`
      select
        (select count(*)::text from catalog_items where active) as active,
        (select count(*)::text from catalog_items where active and inventory = 0) as out_of_stock,
        (select coalesce(json_agg(json_build_object('name', name, 'n', n) order by n desc, name), '[]')::text
           from (
             select category as name, count(*)::int as n
             from catalog_items where active group by category
           ) s) as categories
  `)) as unknown as Record<string, string>[];

  const gate = await decisionTotals();
  const settlement = await settlementTotals();

  const shelf = shelfRows[0];

  return {
    mandate: mandateRows.length === 0 ? null : toMandate(mandateRows[0]),
    shelf: {
      active: Number(shelf.active),
      outOfStock: Number(shelf.out_of_stock),
      categories: JSON.parse(String(shelf.categories)),
    },
    gate,
    settlement,
  };
}

/** Same derivation as the authorizations page: held is what is reserved and neither committed nor released. */
function toMandate(row: Record<string, string>): MandateView {
  const maxAmountPaise = paiseFromSql(row.max_amount);
  const debitedPaise = paiseFromSql(row.debited);
  const held = paiseFromSql(row.reserved) - debitedPaise - paiseFromSql(row.released);
  const heldPaise = held > 0n ? held : 0n;
  const left = maxAmountPaise - debitedPaise - heldPaise;

  return {
    agentName: row.agent_name,
    principalRef: row.principal_ref,
    maxAmountPaise,
    debitedPaise,
    heldPaise,
    availablePaise: left > 0n ? left : 0n,
    maxPerOrderPaise: paiseFromSql(row.max_per_order),
  };
}
