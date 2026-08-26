import { landingStats } from "@/core/db/queries";
import { Skeleton } from "@/components/ui/skeleton";

// Read from the database, never typed in. The previous hardcoded strip claimed 210 decisions and a
// 1.4ms median while /metrics showed none and 3us — one click apart, and the front door was wrong.
export async function Stats() {
  const s = await landingStats();

  const tiles: [string, string][] = [
    [count(s.decisions), "gate decisions on the record"],
    [count(s.stopped), "refused or escalated"],
    [count(s.receipts), "receipts signed"],
    [latency(s.p50Ms), "median policy decision"],
  ];

  return (
    <StatsFrame>
      {tiles.map(([value, caption], i) => (
        <Cell key={caption} index={i}>
          <div className="font-display text-[2.75rem] leading-none tracking-[-0.05em] text-fg-white">{value}</div>
          <div className="label mt-3">{caption}</div>
        </Cell>
      ))}
    </StatsFrame>
  );
}

/** The hero must not wait on Postgres, so this holds the strip's exact height while it streams. */
export function StatsSkeleton() {
  return (
    <StatsFrame>
      {Array.from({ length: 4 }, (_, i) => (
        <Cell key={i} index={i}>
          <Skeleton className="h-11 w-24 rounded-[3px]" />
          <Skeleton className="mt-4 h-3 w-40 rounded-[2px]" />
        </Cell>
      ))}
    </StatsFrame>
  );
}

function StatsFrame({ children }: { children: React.ReactNode }) {
  return <section className="mx-auto grid max-w-[1200px] grid-cols-2 border-y border-hairline md:grid-cols-4">{children}</section>;
}

function Cell({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <div className={`px-7 py-12 ${index > 0 ? "md:border-l md:border-hairline" : ""}`}>{children}</div>
  );
}

const count = (n: number) => (n === 0 ? "—" : n.toLocaleString("en-IN"));

/** A rounded 0 is a real sub-millisecond decision, not a missing one. Those are different. */
function latency(ms: number | null): string {
  if (ms === null) return "—";
  return ms === 0 ? "<1ms" : `${ms}ms`;
}
