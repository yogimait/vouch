import type { GateRow } from "@/core/db/queries";
import { Outcome } from "../ui";

/** Grouped by source first. A single "total decisions" figure across sources would be a lie. */
export function GateTable({ rows, source }: { rows: GateRow[]; source: string }) {
  const mine = rows.filter((r) => r.source === source);
  if (mine.length === 0) return <p className="text-sm text-fg-3">Nothing recorded from {source}.</p>;

  const total = mine.reduce((n, r) => n + r.n, 0);

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left">
            {["Violation class", "Outcome", "Count", "p50"].map((h) => (
              <th key={h} className="label py-2 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mine.map((r) => (
            <tr key={`${r.label}-${r.outcome}`} className="border-b border-hairline">
              <td className="py-2 font-mono text-xs">{r.label ?? "—"}</td>
              <td className="py-2"><Outcome value={r.outcome as "ADMIT"} /></td>
              <td className="py-2 text-right font-mono tabular-nums">{r.n}</td>
              <td className="py-2 text-right font-mono text-xs text-fg-3">{r.p50Ms === 0 ? "<1ms" : `${r.p50Ms}ms`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-fg-3">{total} decisions from {source}.</p>
    </>
  );
}
