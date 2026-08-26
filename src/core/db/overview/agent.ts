// One agent's standing, read before it is sent anywhere: what it may spend, what it has tried,
// where it was stopped, and when it stated a price the merchant never signed.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { balances } from "@/core/ledger";
import { paiseFromSql } from "@/core/money";

export interface AgentMandate {
  maxPaise: string;
  debitedPaise: string;
  heldPaise: string;
  availablePaise: string;
  maxPerOrderPaise: string;
  maxOrdersPerHour: number;
  /** Already a date string. A Date would have to cross the server/client boundary to say the same thing. */
  expireAt: string;
}

export interface AgentStop { code: string; n: number; escalates: boolean }
export interface MisquoteKind { kind: string; n: number }

export interface AgentOverview {
  id: string;
  name: string;
  status: "ACTIVE" | "FROZEN";
  frozenReason: string | null;
  mandate: AgentMandate | null;
  /** Decisions. Never added to anything on the mandate, which counts rupees. */
  tried: { total: number; admit: number; escalate: number; refuse: number };
  stops: AgentStop[];
  misquotes: MisquoteKind[];
  lastWords: string | null;
}

/**
 * Four concurrent round trips, because Supabase latency dominates this page. Balances follow in a
 * fifth: they need the authorization id, and the formula lives in @/core/ledger and is not restated.
 */
export async function agentOverview(agentId: string): Promise<AgentOverview> {
  const db = getDb();

  // Sequential, not Promise.all. Promise.all builds the array eagerly, so every statement
  // takes a pooled connection at once; holding several per request deadlocks the pool the
  // moment a few pages load together — the browser then shows a skeleton that never ends.
  const metaRows = (await db.execute(sql`
      select
        g.name, g.status, g.frozen_reason,
        z.id as auth_id,
        z.max_amount_paise::text as max_paise,
        z.max_per_order_paise::text as per_order_paise,
        z.max_orders_per_hour::text as orders_per_hour,
        to_char(z.expire_at, 'YYYY-MM-DD') as expires
      from buyer_agents g
      left join authorizations z on z.agent_id = g.id and z.status = 'confirmed'
      where g.id = ${agentId}
      limit 1
    `)) as unknown as Record<string, string | null>[];
  // source = 'llm' throughout this file: a scripted harness violation is not a model's attempt at
  // the same thing, and this page is only ever about the model.
  const triedRows = (await db.execute(sql`
      select
        count(*)::text as total,
        count(*) filter (where outcome = 'ADMIT')::text as admit,
        count(*) filter (where outcome = 'ESCALATE')::text as escalate,
        count(*) filter (where outcome = 'REFUSE')::text as refuse
      from decisions where agent_id = ${agentId} and source = 'llm'
    `)) as unknown as Record<string, string>[];
  // An ADMIT carries no reasons at all, so the length filter alone leaves only the stops.
  const stopRows = (await db.execute(sql`
      select
        reasons -> 0 ->> 'code' as code,
        count(*)::text as n,
        bool_or(outcome = 'ESCALATE') as escalates
      from decisions
      where agent_id = ${agentId} and source = 'llm' and jsonb_array_length(reasons) > 0
      group by 1
      order by count(*) desc
      limit 5
    `)) as unknown as Record<string, string | boolean | null>[];
  const misquoteRows = (await db.execute(sql`
      select
        (select coalesce(json_agg(k), '[]')::text from (
           select kind, count(*)::text as n from misquote_events
           where agent_id = ${agentId} and source = 'llm'
           group by kind order by count(*) desc
         ) k) as kinds,
        (select raw_agent_text from misquote_events
         where agent_id = ${agentId} and source = 'llm' and raw_agent_text is not null
         order by created_at desc limit 1) as words
    `)) as unknown as Record<string, string | null>[];

  const meta = metaRows[0];
  if (!meta) throw new Error(`No such agent: ${agentId}`);

  const t = triedRows[0];
  const m = misquoteRows[0];

  return {
    id: agentId,
    name: String(meta.name),
    status: meta.status === "FROZEN" ? "FROZEN" : "ACTIVE",
    frozenReason: meta.frozen_reason === null ? null : String(meta.frozen_reason),
    mandate: await mandate(meta),
    tried: {
      total: Number(t.total), admit: Number(t.admit),
      escalate: Number(t.escalate), refuse: Number(t.refuse),
    },
    stops: stopRows
      .filter((r) => r.code !== null)
      .map((r) => ({ code: String(r.code), n: Number(r.n), escalates: r.escalates === true })),
    misquotes: (JSON.parse(String(m.kinds ?? "[]")) as { kind: string; n: string }[])
      .map((k) => ({ kind: k.kind, n: Number(k.n) })),
    lastWords: m.words === null ? null : String(m.words),
  };
}

/** Null is a real state: an agent with no confirmed authorization cannot quote, let alone pay. */
async function mandate(meta: Record<string, string | null>): Promise<AgentMandate | null> {
  if (meta.auth_id === null) return null;

  const maxPaise = paiseFromSql(meta.max_paise);
  const b = await balances(String(meta.auth_id), maxPaise);

  return {
    maxPaise: maxPaise.toString(),
    debitedPaise: b.debitedPaise.toString(),
    heldPaise: b.heldPaise.toString(),
    availablePaise: b.availablePaise.toString(),
    maxPerOrderPaise: paiseFromSql(meta.per_order_paise).toString(),
    maxOrdersPerHour: Number(meta.orders_per_hour),
    expireAt: String(meta.expires),
  };
}
