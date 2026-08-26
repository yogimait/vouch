"use client";

/**
 * React Bits' AnimatedList, reduced to the part that reads on a log: edge fades that track the
 * scroll, so a cut-off row looks cut off rather than sliced. Its per-item useInView is deliberately
 * not ported — two hundred observers on the decisions table once cost the page five seconds, and
 * the same entrance comes free from a CSS delay on the row (see DataTable).
 */

import { useCallback, useState, type ReactNode, type UIEvent } from "react";
import { cn } from "@/lib/utils";

/** Roughly one row of travel: the fade is gone by the time the first row clears the edge. */
const RAMP = 44;

export function AnimatedList({ children, className }: { children: ReactNode; className?: string }) {
  const [top, setTop] = useState(0);
  const [bottom, setBottom] = useState(0);

  const read = useCallback((el: HTMLElement) => {
    setTop(Math.min(el.scrollTop / RAMP, 1));
    const below = el.scrollHeight - el.clientHeight - el.scrollTop;
    setBottom(below <= 0 ? 0 : Math.min(below / RAMP, 1));
  }, []);

  // A ref callback, not an effect: it fires once the node exists, which is when the height is known.
  const measure = useCallback((el: HTMLDivElement | null) => { if (el) read(el); }, [read]);
  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => read(e.currentTarget), [read]);

  return (
    <div className="relative flex-1 lg:min-h-0">
      <div ref={measure} onScroll={onScroll} className={cn("lg:h-full lg:overflow-auto", className)}>
        {children}
      </div>
      {/* Below the sticky header's z-10, so a pinned thead never sits behind its own fade. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 hidden h-9 bg-gradient-to-b from-background to-transparent transition-opacity duration-300 lg:block"
        style={{ opacity: top }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-14 bg-gradient-to-t from-background to-transparent transition-opacity duration-300 lg:block"
        style={{ opacity: bottom }}
      />
    </div>
  );
}
