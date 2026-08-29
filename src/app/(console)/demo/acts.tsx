"use client";

/**
 * Four acts, one at a time. Stacked they ran to about 1,600px, so narrating act three meant
 * scrolling past two others to reach it. Same shape as /agent: pick on the left, watch on the right.
 */

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ScrollPanel } from "../ui";

export interface Act { title: string; asks: string; body: ReactNode }

export function Acts({ acts, aside }: { acts: Act[]; aside?: ReactNode }) {
  const [selected, setSelected] = useState(0);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <nav className="rounded-[3px] border border-hairline">
          {acts.map((a, i) => (
            <button
              key={a.title}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={i === selected}
              className={cn(
                "feedback block w-full border-t border-hairline px-4 py-3 text-left first:border-t-0",
                i === selected ? "bg-raised" : "hover:bg-raised/50",
              )}
            >
              <div className="flex items-baseline gap-3">
                <span className={cn("font-mono text-xs", i === selected ? "text-primary" : "text-fg-3")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm">{a.title}</span>
              </div>
              <p className="mt-1 text-xs leading-snug text-fg-3">{a.asks}</p>
            </button>
          ))}
        </nav>
        {aside}
      </div>

      <ScrollPanel title={acts[selected].title} bodyClassName="p-6" className="mt-0 lg:min-h-[34rem]">
        {/* Hidden, not unmounted: a gate report and a settled order each cost a real round trip, and
            switching acts to look at something else must not throw them away. */}
        {acts.map((a, i) => (
          <div key={a.title} className={i === selected ? undefined : "hidden"}>
            <p className="mb-6 text-sm text-fg-2">{a.asks}</p>
            {a.body}
          </div>
        ))}
      </ScrollPanel>
    </div>
  );
}
