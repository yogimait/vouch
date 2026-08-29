"use client";

/**
 * Every ledger table printed a bare UTC clock. A run made at 11:27 IST rendered as 05:57, directly
 * above a row from the previous evening reading 17:15 — a bigger number on an older row, so the log
 * looked unsorted and nothing looked recent. Relative age has no timezone to get wrong.
 */

import { useSyncExternalStore } from "react";

const REL = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60], ["minute", 60], ["hour", 24], ["day", 7],
];

/** Never fires: the only question is server render versus client render, and that changes once. */
const NEVER = () => () => {};

function ago(at: Date): string {
  let n = (at.getTime() - Date.now()) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(n) < size) return REL.format(Math.round(n), unit);
    n /= size;
  }
  return at.toLocaleDateString();
}

export function When({ at, compact }: { at: Date; compact?: boolean }) {
  // The server has no timezone to render in, so it keeps the UTC stamp and React swaps in the
  // reader's own clock after hydration. Doing this in an effect would be a cascading render.
  const mounted = useSyncExternalStore(NEVER, () => true, () => false);

  if (!mounted) return <span className="font-mono text-xs">{at.toISOString().slice(11, 19)}Z</span>;

  return (
    <>
      <span className="font-mono text-xs" title={at.toISOString()}>{ago(at)}</span>
      {/* compact: inside a flex row the second line would break the row, so it becomes the tooltip. */}
      {!compact && <div className="font-mono text-xs text-fg-3">{at.toLocaleTimeString()}</div>}
    </>
  );
}
