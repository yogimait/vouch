// Summary for /misquotes. Three aggregates, issued together: Supabase round-trip latency dominates.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { paiseFromSql } from "@/core/money";

export interface MisquotesOverview {
  totals: { total: number; withText: number; paired: number; gapPaise: bigint };
  kinds: { kind: string; n: number }[];
  sources: { source: string; n: number; withText: number }[];
}

const HAS_TEXT = sql`raw_agent_text is not null and raw_agent_text <> ''`;

export async function misquotesOverview(): Promise<MisquotesOverview> {
  const db = getDb();

  // Sequential, not Promise.all. Promise.all builds the array eagerly, so every statement
  // takes a pooled connection at once; holding several per request deadlocks the pool the
  // moment a few pages load together — the browser then shows a skeleton that never ends.
  // The gap is summed per event and cast to text: the driver must not round a money total.
  const totals = (await db.execute(sql`
      select
        count(*)::text as total,
        count(*) filter (where ${HAS_TEXT})::text as with_text,
        count(*) filter (where claimed_paise is not null and signed_paise is not null)::text as paired,
        coalesce(sum(abs(claimed_paise - signed_paise))
          filter (where claimed_paise is not null and signed_paise is not null), 0)::text as gap
      from misquote_events
    `)) as unknown as Record<string, string>[];
  // enum_range, not group by: the six kinds are a closed set, so a kind at zero is a measured
  // zero and belongs on the chart. Grouping the table alone would silently hide it.
  const kindRows = (await db.execute(sql`
      select k.kind::text as kind, count(e.id)::text as n
      from unnest(enum_range(null::misquote_kind)) as k(kind)
      left join misquote_events e on e.kind = k.kind
      group by k.kind
      order by count(e.id) desc, k.kind
    `)) as unknown as Record<string, string>[];
  const sourceRows = (await db.execute(sql`
      select source, count(*)::text as n, count(*) filter (where ${HAS_TEXT})::text as with_text
      from misquote_events group by source order by count(*) desc
    `)) as unknown as Record<string, string>[];

  const t = totals[0];

  return {
    totals: {
      total: Number(t.total),
      withText: Number(t.with_text),
      paired: Number(t.paired),
      gapPaise: paiseFromSql(t.gap),
    },
    kinds: kindRows.map((r) => ({ kind: String(r.kind), n: Number(r.n) })),
    sources: sourceRows.map((r) => ({ source: String(r.source), n: Number(r.n), withText: Number(r.with_text) })),
  };
}
