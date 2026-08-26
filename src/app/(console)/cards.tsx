"use client";

/**
 * The console's summary-card vocabulary, in one place. Seven routes draw the same four-across row of
 * cards; copying the shell into each one guaranteed they would drift apart at the first breakpoint.
 */

import { MagicCard } from "@/components/ui/magic-card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";
import { pct, TONE, type Tone } from "./format";


/** A row of four on a wide screen, 2x2 below it. Never 2x2 at xl: the panel under it needs the height. */
export function Quadrant({ children }: { children: React.ReactNode }) {
  return <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/** Index drives the reveal stagger, so a page never hand-writes a delay and never gets it wrong. */
export function StatCard({ title, index = 0, children }: { title: string; index?: number; children: React.ReactNode }) {
  return (
    <BlurFade delay={index * 0.06} duration={0.7} offset={10} inView>
      <MagicCard
        className="relative h-full overflow-hidden rounded-[3px] p-0"
        gradientSize={260}
        gradientFrom="#2dd4bf"
        gradientTo="rgba(45,212,191,0.18)"
        gradientColor="#101013"
        gradientOpacity={0.3}
      >
        <div className="flex h-full flex-col p-4">
          <span className="label">{title}</span>
          {children}
        </div>
      </MagicCard>
    </BlurFade>
  );
}

interface BigProps {
  /** A number counts up. A word, a code or a rupee amount does not — money is bigint, not a float. */
  value: string | number;
  caption?: string;
  tone?: Tone | "plain";
  className?: string;
}

export function Big({ value, caption, tone = "plain", className }: BigProps) {
  const colour = tone === "plain" ? "text-fg-white" : TONE[tone].text;

  return (
    <div className="mt-2">
      <div className={cn("font-display text-[2.5rem] leading-none tracking-[-0.05em]", colour, className)}>
        {typeof value === "number" ? <NumberTicker value={value} className="font-display" /> : value}
      </div>
      {caption && <div className="label mt-1.5">{caption}</div>}
    </div>
  );
}

interface BarRowProps {
  name: string;
  value: number;
  of: number;
  tone?: Tone | "neutral";
  /** Monospace for codes and identifiers; the sentence face for words. */
  mono?: boolean;
  width?: string;
}

/** Label, proportional rail, count. Every bar list in the console is this row. */
export function BarRow({ name, value, of, tone = "neutral", mono, width = "w-[5.75rem]" }: BarRowProps) {
  const fill = tone === "neutral" ? "rgba(255,255,255,0.28)" : TONE[tone].fill;
  const text = tone === "neutral" ? "text-fg-2" : TONE[tone].text;

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn("shrink-0 truncate", width, text, mono ? "font-mono text-[10px]" : "text-[10px] tracking-[0.06em]")}
        title={name}
      >
        {name}
      </span>
      <span className="h-[3px] flex-1 overflow-hidden rounded-[1px] bg-white/5">
        <span className="block h-full" style={{ width: pct(value, of), background: fill }} />
      </span>
      <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums">{value}</span>
    </div>
  );
}

/** A hairline-separated list, for sets that are counted apart and never summed. */
export function HairRow({ name, value }: { name: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-b-0">
      <span className="font-mono text-[11px]">{name}</span>
      <span className="font-mono text-xs tabular-nums">{value}</span>
    </div>
  );
}

export function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={cn("mt-1 font-mono text-[13px] tabular-nums", tone)}>{value}</div>
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11px] leading-relaxed text-fg-3">{children}</p>;
}

/** Newest is first in every query, so the path draws right to left and reads as time. */
export function Spark({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;

  const max = Math.max(...points, 1);
  const step = 140 / (points.length - 1);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${140 - i * step} ${40 - (v / max) * 34}`)
    .join(" ");

  return (
    <svg viewBox="0 0 142 42" className={cn("h-8 w-24 shrink-0", className)} fill="none" aria-hidden>
      <path d={d} stroke="var(--admit)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
