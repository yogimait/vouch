"use client";

/**
 * The newest ADMIT, the newest ESCALATE and the newest REFUSE, cycling. The verdict is set in a
 * character grid that dissolves between words; everything under it is the row that produced it.
 */

import { useEffect, useState } from "react";
import { PixelWord } from "@/components/ui/pixel-word";
import type { LatestVerdict } from "@/core/db/queries";
import { formatInr } from "@/core/money";
import { cn } from "@/lib/utils";
import { TONE } from "../(console)/format";

const HOLD = 4200;
const WIDEST = 8; // "ESCALATE" — the canvas is sized once and never reflows mid-cycle.

const CAPTION = {
  ADMIT: "it stayed inside its authority",
  ESCALATE: "beyond what was delegated, so a person finishes it",
  REFUSE: "with a code the agent can act on",
} as const;

/** Read off :root rather than duplicated here, so the palette has exactly one home. */
function hueOf(outcome: string): string {
  if (typeof window === "undefined") return "#2dd4bf";
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${outcome.toLowerCase()}`);
  return value.trim() || "#2dd4bf";
}

export function VerdictPixels({ rows }: { rows: LatestVerdict[] }) {
  const [at, setAt] = useState(0);

  useEffect(() => {
    if (rows.length < 2) return;
    // Replacing content mid-read is exactly what the preference asks you not to do, and PixelWord
    // draws a single static frame under it — cycling here would leave the word behind the caption.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setAt((i) => (i + 1) % rows.length), HOLD);
    return () => clearInterval(timer);
  }, [rows.length]);

  if (rows.length === 0) return null;

  const row = rows[at];
  const tone = TONE[row.outcome];

  return (
    <div data-testid="verdict-pixels" className="w-[30rem]">
      <p className="kicker">{"// the newest of each, off the record"}</p>

      <div className="mt-5">
        <PixelWord word={row.outcome} colour={hueOf(row.outcome)} widest={WIDEST} cell={10} />
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-fg-2">{CAPTION[row.outcome]}</p>

      <div className="mt-5 flex flex-col gap-1.5 border-t border-hairline pt-4">
        <Line
          k={row.sku ? `${row.sku} × ${row.qty}` : "no offer was resolved"}
          v={row.amountPaise ? formatInr(BigInt(row.amountPaise)) : "—"}
        />
        {row.code && (
          <Line
            k={row.code}
            v={row.observed ? `${money(row.observed)} · limit ${money(row.expected)}` : ""}
            tone={tone.text}
          />
        )}
        <Line k={`${row.source} · ${row.at.slice(11, 19)}`} v={row.latencyMs === 0 ? "<1ms" : `${row.latencyMs}ms`} />
      </div>
    </div>
  );
}

function Line({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className={cn("truncate font-mono text-xs", tone ?? "text-fg-3")} title={k}>{k}</span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-fg-3">{v}</span>
    </div>
  );
}

/** Reason values carry paise as strings; a category list or a count is left alone. */
function money(value: string | null): string {
  if (value === null || !/^\d+$/.test(value)) return String(value ?? "—");
  return formatInr(BigInt(value));
}
