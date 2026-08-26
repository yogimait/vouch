import type { MisquotesOverview } from "@/core/db/overview/misquotes";
import { formatInr } from "@/core/money";
import { Big, BarRow, Figure, HairRow, Note, Quadrant, StatCard } from "../cards";

/** Server, not client: gapPaise is a bigint, and formatting it here keeps one off the RSC wire. */

function Gap({ totals }: { totals: MisquotesOverview["totals"] }) {
  return (
    <StatCard title="The gap it tried to open" index={0}>
      <Big
        value={totals.paired > 0 ? formatInr(totals.gapPaise) : "—"}
        caption={totals.paired > 0 ? `across ${totals.paired} priced claims` : "no priced claim recorded yet"}
        tone="REFUSE"
        className="text-[2rem]"
      />
      <Note>
        Claimed against signed, summed. This is money an agent tried to talk its way out of paying —
        it never moved, and it is not a settlement figure.
      </Note>
    </StatCard>
  );
}

/** The six kinds are a closed enum, so the whole taxonomy is drawn and a kind at zero draws nothing. */
function Kinds({ kinds, total }: { kinds: MisquotesOverview["kinds"]; total: number }) {
  return (
    <StatCard title="How it went wrong" index={1}>
      <div className="mt-3 flex flex-col gap-2">
        {kinds.map((k) => (
          <BarRow key={k.kind} name={k.kind} value={k.n} of={total} tone="REFUSE" mono width="min-w-0 flex-1" />
        ))}
      </div>
      <Note>Every kind the engine can name, whether or not it has happened.</Note>
    </StatCard>
  );
}

function Sources({ sources }: { sources: MisquotesOverview["sources"] }) {
  return (
    <StatCard title="Where from, never summed" index={2}>
      <div className="mt-3 flex flex-col">
        {sources.length === 0
          ? <p className="text-sm text-fg-3">Nothing recorded yet.</p>
          : sources.map((s) => <HairRow key={s.source} name={s.source} value={s.n} />)}
      </div>
      <Note>A model&rsquo;s attempt and a scripted one are counted apart on purpose; never summed.</Note>
    </StatCard>
  );
}

function Words({ totals, sources }: Pick<MisquotesOverview, "totals" | "sources">) {
  return (
    <StatCard title="In its own words" index={3}>
      <Big
        value={totals.total > 0 ? `${totals.withText} / ${totals.total}` : "—"}
        caption={totals.total > 0 ? "carry the agent's verbatim text" : "nothing recorded yet"}
      />
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {sources.map((s) => (
          <Figure key={s.source} label={s.source} value={`${s.withText} / ${s.n}`} />
        ))}
      </div>
      <Note>A scripted call has no words to keep; only a model leaves any.</Note>
    </StatCard>
  );
}

export function MisquoteCards({ overview }: { overview: MisquotesOverview }) {
  return (
    <Quadrant>
      <Gap totals={overview.totals} />
      <Kinds kinds={overview.kinds} total={overview.totals.total} />
      <Sources sources={overview.sources} />
      <Words totals={overview.totals} sources={overview.sources} />
    </Quadrant>
  );
}
