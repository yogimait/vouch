/**
 * Pure helpers, deliberately NOT in cards.tsx. That file is "use client", and a Server Component
 * importing a function from it gets a client reference rather than the function — which type-checks,
 * lints clean, and throws only at request time. /metrics went down exactly that way.
 */

export const TONE = {
  ADMIT: { text: "text-admit", fill: "var(--admit)" },
  ESCALATE: { text: "text-escalate", fill: "var(--escalate)" },
  REFUSE: { text: "text-refuse", fill: "var(--refuse)" },
} as const;

export type Tone = keyof typeof TONE;

/**
 * No floor. An earlier version clamped to 1% so a bar was always visible, which painted a sliver for
 * a count of zero — fabricating a quantity on the pages that argue balances are never fabricated.
 */
export function pct(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0%";
  return `${Math.min(100, (part / whole) * 100)}%`;
}

/**
 * What a source is called on screen. decisions.source records how a call arrived, and the four values
 * it can hold are ours, not a merchant's — nobody reading their own gate should have to know what a
 * harness is. Renamed here rather than in the column: the stored value is what the tests assert on.
 */
const SOURCE_LABELS: Record<string, string> = {
  harness: "conformance run",
  http: "live API",
  llm: "AI buyer",
  mcp: "MCP client",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** The engine resolves well under a millisecond. Rendering that as "0ms" reads as a broken timer. */
export function micros(v: number | null): string {
  if (v === null) return "—";
  if (v < 1000) return "<1ms";
  return `${(v / 1000).toFixed(1)}ms`;
}
