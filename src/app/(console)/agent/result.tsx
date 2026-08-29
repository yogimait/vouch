"use client";

/**
 * One run, rendered whole. Lifted out of the console so the same markup serves the run streaming now
 * and any run picked out of the log — a past run that rendered differently would not be evidence.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Outcome, type OutcomeValue } from "../ui";
import { Step } from "./transcript";
import { Decisions } from "./decisions";
import type { PastRun } from "./log";

/** The border carries the verdict, so the answer is legible before a word of it is read. */
const EDGE: Record<string, string> = {
  ADMIT: "border-admit/40",
  ESCALATE: "border-escalate/40",
  REFUSE: "border-refuse/40",
};

export function Result({ run }: { run: PastRun }) {
  const { decisions, misquotes } = run.result;
  // First-match engine, so the last rule to fire is the one the errand ended on.
  const final = decisions.at(-1)?.outcome ?? null;

  return (
    <>
      {/* The errand leads. Reading a transcript without the instruction that caused it is guesswork. */}
      <div className="mb-6 rounded-[3px] border border-hairline bg-raised/40 px-4 py-3">
        <div className="label mb-1">the errand</div>
        <p className="text-sm leading-relaxed text-fg-2">{run.instruction}</p>
      </div>

      <ol>{run.steps.map((s) => <Step key={s.index} step={s} />)}</ol>

      {decisions.length > 0 && <Decisions rows={decisions} />}

      {misquotes.length > 0 && (
        <Card className="mt-8 gap-0 border-refuse/40 p-5">
          <div className="label mb-3 text-refuse">it tried to state a price the merchant never signed · {misquotes.length}</div>
          {misquotes.map((m, i) => (
            <div key={i} className="border-t border-hairline py-3 first:border-t-0 first:pt-0">
              <span className="font-mono text-xs">{m.kind}</span>
              {m.code && <span className="ml-3 text-sm">invented <span className="font-mono text-refuse">{m.code}</span></span>}
              {m.claimed && <span className="ml-3 text-sm">claimed {m.claimed} against a signed {m.signed}</span>}
            </div>
          ))}
        </Card>
      )}

      {run.verdict && (
        <section className="mt-8">
          <Separator className="mb-6" />

          <div className={cn("rounded-[3px] border p-5", final ? EDGE[final] : "border-hairline")}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="label">how it ended</span>
              {final
                ? <Outcome value={final as OutcomeValue} />
                : <span className="font-mono text-xs text-fg-3">{run.orderId ? "replayed" : "no verdict"}</span>}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{run.verdict}</p>

            {/* Buttons, not links in a row: these are the next steps, and one of them spends money. */}
            <div className="mt-5 flex flex-wrap gap-2">
              {run.orderId && (
                <Button asChild size="sm" className="rounded-[2px]">
                  <Link href={`/pay/${run.orderId}`}>Authorize the payment</Link>
                </Button>
              )}
              <Button asChild size="sm" variant="outline" className="rounded-[2px]">
                <Link href="/decisions">The decision it produced</Link>
              </Button>
              {run.orderId && (
                <Button asChild size="sm" variant="outline" className="rounded-[2px]">
                  <Link href={`/receipts/${run.orderId}`}>Its receipt</Link>
                </Button>
              )}
            </div>
          </div>

          {/* The model invents its own idempotency key, so the same errand twice often lands on the
              same one. Silence here read as "the log is broken"; it is the opposite. */}
          {run.orderId && decisions.length === 0 && (
            <p className="mt-4 text-xs text-fg-3">
              No new row on the decisions log: this order already existed under the same idempotency
              key, so the guard returned its original verdict rather than ruling on it twice.
            </p>
          )}
          {misquotes.length === 0 && (
            <p className="mt-4 text-xs text-fg-3">
              It stayed honest this run. That is a real result, not a failure — temperature is 0.7, so send it again for another sample.
            </p>
          )}
        </section>
      )}
    </>
  );
}
