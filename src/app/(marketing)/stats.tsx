import { landingStats } from "@/core/db/queries";

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
    <section className="grid grid-cols-2 border-y border-hairline md:grid-cols-4">
      {tiles.map(([value, caption], i) => (
        <div key={caption} className={`px-8 py-12 text-center ${i > 0 ? "md:border-l md:border-hairline" : ""}`}>
          <div className="font-display text-5xl text-white">{value}</div>
          <div className="mt-3 font-mono text-xs tracking-wider text-fg-3 uppercase">{caption}</div>
        </div>
      ))}
    </section>
  );
}

const count = (n: number) => (n === 0 ? "—" : n.toLocaleString("en-IN"));

/** A rounded 0 is a real sub-millisecond decision, not a missing one. Those are different. */
function latency(ms: number | null): string {
  if (ms === null) return "—";
  return ms === 0 ? "<1ms" : `${ms}ms`;
}
