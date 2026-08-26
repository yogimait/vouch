"use client";

import DecryptedText from "@/components/ui/decrypted-text";
import type { AgentOverview } from "@/core/db/overview/agent";
import type { DecisionSummary, Mandate, Misquote } from "@/demo/agent";
import { Big, BarRow, Note, Quadrant, StatCard } from "../cards";
import { MandateCard } from "./mandate";

/** What the SSE "done" event carried back, accumulated across every run since the page loaded. */
export interface RunResult { mandate: Mandate | null; decisions: DecisionSummary[]; misquotes: Misquote[] }

export function AgentCards({ overview, runs }: { overview: AgentOverview; runs: RunResult[] }) {
  const now = fold(overview, runs);

  return (
    <Quadrant>
      <MandateCard mandate={now.mandate} frozen={now.status === "FROZEN"} reason={now.frozenReason} />
      <Tried tried={now.tried} />
      <Stops stops={now.stops} />
      <Misquoted misquotes={now.misquotes} words={now.lastWords} />
    </Quadrant>
  );
}

function Tried({ tried }: { tried: AgentOverview["tried"] }) {
  const rows = [
    ["ADMITTED", tried.admit, "ADMIT"],
    ["ESCALATED", tried.escalate, "ESCALATE"],
    ["REFUSED", tried.refuse, "REFUSE"],
  ] as const;

  return (
    <StatCard title="What it has tried" index={1}>
      <Big value={tried.total} caption="decisions this model produced" />
      <div className="mt-4 flex flex-col gap-2">
        {rows.map(([name, n, tone]) => (
          <BarRow key={name} name={name} value={n} of={tried.total} tone={tone} />
        ))}
      </div>
      <Note>Decisions, not rupees. The mandate beside this counts money, and the two are never added.</Note>
    </StatCard>
  );
}

/** reasons[0] is the rule that fired — the engine is first-match, so entry zero is the verdict. */
function Stops({ stops }: { stops: AgentOverview["stops"] }) {
  const top = stops[0];

  return (
    <StatCard title="Where it stopped" index={2}>
      {!top ? (
        <p className="mt-4 text-sm text-fg-3">Nothing has stopped it yet.</p>
      ) : (
        <>
          {/* The code is the one thing here worth reading, so it is the one thing that decodes. */}
          <div className={`mt-2 font-mono text-lg ${top.escalates ? "text-escalate" : "text-refuse"}`}>
            <DecryptedText
              text={top.code}
              animateOn="view"
              sequential
              speed={22}
              className="font-mono"
              encryptedClassName="font-mono text-fg-3"
            />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {stops.slice(0, 4).map((s) => (
              <BarRow
                key={s.code}
                name={s.code}
                value={s.n}
                of={top.n}
                tone={s.escalates ? "ESCALATE" : "REFUSE"}
                mono
                width="min-w-0 flex-1"
              />
            ))}
          </div>
        </>
      )}
    </StatCard>
  );
}

function Misquoted({ misquotes, words }: { misquotes: AgentOverview["misquotes"]; words: string | null }) {
  const total = misquotes.reduce((n, m) => n + m.n, 0);

  return (
    <StatCard title="When it misquoted" index={3}>
      {total === 0 ? (
        <p className="mt-4 text-sm text-fg-3">It has never stated a price the merchant did not sign.</p>
      ) : (
        <>
          <Big value={total} tone="REFUSE" caption="prices the merchant never signed" />
          <div className="mt-4 flex flex-col gap-2">
            {misquotes.map((m) => (
              <BarRow key={m.kind} name={m.kind} value={m.n} of={total} tone="REFUSE" mono width="min-w-0 flex-1" />
            ))}
          </div>
        </>
      )}
      {words && <Note><span className="line-clamp-3 italic text-fg-2">&ldquo;{words}&rdquo;</span></Note>}
    </StatCard>
  );
}

/**
 * The page loads its counts once and every run since adds to them. Each "done" reports only its own
 * rows, so all the runs are folded in together — keeping just the newest would drop earlier ones off
 * the card while they sit in the database.
 */
function fold(base: AgentOverview, runs: RunResult[]): AgentOverview {
  if (runs.length === 0) return base;

  const tried = { ...base.tried };
  const stops = new Map(base.stops.map((s) => [s.code, { ...s }]));
  const kinds = new Map(base.misquotes.map((m) => [m.kind, m.n]));
  let lastWords = base.lastWords;

  for (const run of runs) {
    for (const d of run.decisions) {
      tried.total += 1;
      if (d.outcome === "ADMIT") tried.admit += 1;
      else if (d.outcome === "ESCALATE") tried.escalate += 1;
      else tried.refuse += 1;

      if (!d.code) continue;
      const prior = stops.get(d.code);
      if (prior) prior.n += 1;
      else stops.set(d.code, { code: d.code, n: 1, escalates: d.outcome === "ESCALATE" });
    }

    for (const q of run.misquotes) {
      kinds.set(q.kind, (kinds.get(q.kind) ?? 0) + 1);
      if (q.words) lastWords = q.words;
    }
  }

  // Only the four balances are re-read after a run; the caps and the expiry cannot have moved.
  const drained = runs.at(-1)?.mandate;

  return {
    ...base,
    mandate: base.mandate && drained ? { ...base.mandate, ...drained } : base.mandate,
    tried,
    stops: [...stops.values()].sort((a, b) => b.n - a.n).slice(0, 5),
    misquotes: [...kinds].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n),
    lastWords,
  };
}
