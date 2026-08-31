"use client";

import { pct, TONE } from "../format";
import { cn } from "@/lib/utils";

/**
 * BarRow with a line drawn on it. The threshold is the whole point of this screen — a bar that only
 * gets shorter says nothing, and a bar that crosses a marked line says everything — and no existing
 * bar can express one, so this is the single new primitive the page adds.
 */
export function ShelfRow({ name, value, of, mark, alert, right }: {
  name: string;
  value: number;
  of: number;
  /** Where the reorder line sits, in the same units. Omitted for shelves that have no line. */
  mark?: number;
  alert?: boolean;
  right?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className={cn("w-[7.5rem] shrink-0 truncate text-[10px] tracking-[0.06em]", alert ? TONE.REFUSE.text : "text-fg-2")} title={name}>
        {name}
      </span>
      <span className="relative h-[3px] flex-1 overflow-hidden rounded-[1px] bg-white/5">
        {/* The one duration this page uses, borrowed rather than invented: a fourth easing would
            read as a different product. */}
        <span
          className="block h-full transition-[width] duration-[450ms]"
          style={{ width: pct(value, of), background: alert ? TONE.REFUSE.fill : "rgba(255,255,255,0.28)" }}
        />
        {mark !== undefined && (
          <span className="absolute inset-y-0 w-px bg-white/35" style={{ left: pct(mark, of) }} />
        )}
      </span>
      <span className={cn("w-8 shrink-0 text-right font-mono text-xs tabular-nums", alert && TONE.REFUSE.text)}>
        {value}
      </span>
      {right !== undefined && <span className="w-14 shrink-0 text-right font-mono text-[10px] text-fg-3">{right}</span>}
    </div>
  );
}
