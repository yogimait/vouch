import type { ReactNode } from "react";
import { AnimatedList } from "@/components/ui/animated-list";
import { NoiseTexture } from "@/components/ui/noise-texture";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatInr } from "@/core/money";
import { cn } from "@/lib/utils";

export type OutcomeValue = "ADMIT" | "ESCALATE" | "REFUSE";

const VARIANT = { ADMIT: "admit", ESCALATE: "escalate", REFUSE: "refuse" } as const;

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5 shrink-0">
      <h1 className="display-md">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
    </header>
  );
}

/** For routes whose whole body scrolls rather than one panel inside it. The console shell is a
 *  fixed-height flex column, so without this a long page is clipped instead of scrolled. */
export function PageScroll({ children }: { children: ReactNode }) {
  return <div className="flex-1 lg:-mr-3 lg:min-h-0 lg:overflow-y-auto lg:pr-3">{children}</div>;
}

/**
 * The one element on a console page that scrolls. It takes the height the heading and cards leave
 * behind, so the page itself never grows — a dashboard whose summary scrolls away is a report.
 */
export function ScrollPanel({ title, count, children, bodyClassName }: { title: string; count?: number; children: ReactNode; bodyClassName?: string }) {
  return (
    <section className="relative isolate mt-3 flex flex-1 flex-col overflow-hidden rounded-[3px] border border-hairline lg:min-h-0">
      {/* Grain on the panel, not the page. -z-10 so a scrolling ledger runs over it, never under. */}
      <NoiseTexture className="-z-10 opacity-[0.45]" frequency={0.8} slope={0.2} />
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-hairline px-4 py-3.5">
        <span className="label">{title}</span>
        {count !== undefined && <span className="font-mono text-xs tabular-nums text-fg-3">{count}</span>}
      </header>
      {/* The panel is the only scroller on the page, so it is also the only place the fades belong. */}
      <AnimatedList className={bodyClassName}>{children}</AnimatedList>
    </section>
  );
}

/**
 * Say it before the button is pressed, not after. Every demo endpoint is gated on DEMO_CONSOLE, and
 * a gated deployment answers with an envelope the panels used to discard — so four buttons did
 * nothing, four times, in silence.
 */
export function DemoGate({ enabled }: { enabled: boolean }) {
  if (enabled) return null;

  return (
    <p className="mb-4 shrink-0 rounded-[3px] border border-escalate/40 px-4 py-3 text-sm text-escalate">
      The demo console is off on this deployment, so every run here is refused with DEMO_DISABLED.
      Set <span className="font-mono">DEMO_CONSOLE=1</span> in the environment to enable it.
    </p>
  );
}

export function StatTile({ label, value, accent }: { label: string; value: string; accent?: OutcomeValue }) {
  return (
    <Card
      className="gap-0 rounded-[3px] py-5"
      style={accent ? { borderTopWidth: 2, borderTopColor: `var(--${accent.toLowerCase()})` } : undefined}
    >
      <CardContent className="px-6">
        <div className="label">{label}</div>
        <div className="mt-2 font-display text-3xl">{value}</div>
      </CardContent>
    </Card>
  );
}

export function Outcome({ value }: { value: OutcomeValue }) {
  return (
    <Badge variant={VARIANT[value]} className="gap-1.5 rounded-[2px] font-medium tracking-wide">
      <span className="size-1.5 rounded-full bg-current" />
      {value}
    </Badge>
  );
}

/** Ids are long and never the point. Truncate in the middle so both ends stay readable. */
export function Id({ value, head = 8, tail = 6 }: { value: string; head?: number; tail?: number }) {
  const short = value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
  return <span className="font-mono text-xs text-fg-3" title={value}>{short}</span>;
}

export function Money({ paise }: { paise: bigint }) {
  return <span className="font-mono tabular-nums">{formatInr(paise)}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2">
      <span className="label shrink-0">{label}</span>
      <span className="text-right font-mono text-sm break-all">{children}</span>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-[3px] border border-dashed border-hairline px-8 py-16 text-center">
      <p className="text-sm text-fg-2">{title}</p>
      <p className="mt-2 font-mono text-xs text-fg-3">{hint}</p>
    </div>
  );
}

/** Latency rounds to zero on a pure-engine decision. That is sub-millisecond, not missing. */
export function latency(ms: number | null): string {
  if (ms === null) return "—";
  return ms === 0 ? "<1ms" : `${ms}ms`;
}

/** Reason values carry paise as strings. A count (catalog.inventory) is left alone. */
export function asMoney(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return String(value ?? "—");
  return formatInr(BigInt(value));
}

interface VerdictProps {
  valid: boolean;
  signatureValid: boolean;
  tampered: string[];
  chain?: { valid: boolean; rowsChecked: number; brokenAt: string | null };
}

/** States the verdict and what produced it, because "valid" alone is not evidence of anything. */
export function Verdict({ valid, signatureValid, tampered, chain }: VerdictProps) {
  return (
    <Card className={cn("gap-0 rounded-[3px] p-6", valid ? "border-admit/30" : "border-refuse/40")}>
      <div className={cn("font-display text-2xl", valid ? "text-admit" : "text-refuse")}>
        {valid ? "Verified" : "Does not verify"}
      </div>
      <div className="mt-4 grid gap-x-12 gap-y-1 sm:grid-cols-3">
        <Field label="signature">{signatureValid ? "valid" : "FAILED"}</Field>
        <Field label="blocks">{tampered.length ? `ALTERED: ${tampered.join(", ")}` : "all six intact"}</Field>
        <Field label="audit chain">
          {chain ? (chain.valid ? `intact across ${chain.rowsChecked} rows in range` : `BROKEN at ${chain.brokenAt}`) : "not anchored"}
        </Field>
      </div>
    </Card>
  );
}
