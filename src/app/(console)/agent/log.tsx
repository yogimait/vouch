"use client";

/**
 * Every run this tab has made, newest first. The page used to keep one: send a second errand and the
 * first was gone, so nothing could be compared against anything.
 */

import type { RunResult } from "./cards";
import type { StepEvent } from "./transcript";
import { When } from "../when";
import { cn } from "@/lib/utils";

/** One finished run, kept whole — the errand, what streamed, and what the guard did about it. */
export interface PastRun {
  at: number;
  /** The chip id the request was sent with, not the display name the stream reports back. */
  agent: string;
  instruction: string;
  model: string;
  temperature: number;
  steps: StepEvent[];
  verdict: string;
  orderId: string | null;
  result: RunResult;
}

const TONE = { ADMIT: "text-admit", ESCALATE: "text-escalate", REFUSE: "text-refuse" } as const;

/** The engine is first-match, so the last verdict of a run is the one the errand ended on. */
function outcome(r: PastRun): string | null {
  return r.result.decisions.at(-1)?.outcome ?? null;
}

export function RunLog({ runs, selected, onSelect }: {
  runs: PastRun[]; selected: number | null; onSelect: (i: number) => void;
}) {
  if (runs.length === 0) return null;

  return (
    <section className="rounded-[3px] border border-hairline">
      <header className="flex items-baseline justify-between border-b border-hairline px-4 py-3">
        <span className="label">earlier in this tab</span>
        <span className="font-mono text-xs text-fg-3">{runs.length}</span>
      </header>

      <div className="max-h-[22rem] overflow-y-auto">
        {runs.map((r, i) => {
          const o = outcome(r);
          return (
            <button
              key={r.at}
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={i === selected}
              className={cn(
                "feedback block w-full border-t border-hairline px-4 py-3 text-left first:border-t-0",
                i === selected ? "bg-raised" : "hover:bg-raised/50",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                {/* A replay writes no decision of its own: it is answered by the original one. */}
                <span className={cn("font-mono text-xs", o ? TONE[o as keyof typeof TONE] : "text-fg-3")}>
                  {o ?? (r.orderId ? "replayed" : "—")}
                </span>
                <span className="text-fg-3"><When at={new Date(r.at)} compact /></span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm leading-snug">{r.instruction}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-fg-3">{r.verdict}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
