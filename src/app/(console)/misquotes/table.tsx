import { formatInr } from "@/core/money";
import type { MisquoteRow } from "@/core/db/queries";
import { Empty } from "../ui";

/** Rendered per source and never across sources — the totals must not be addable by eye either. */
export function MisquoteTable({ rows, empty }: { rows: MisquoteRow[]; empty: string }) {
  if (rows.length === 0) return <Empty title="Nothing recorded." hint={empty} />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-hairline text-left">
          {["Time", "Agent", "Kind", "Claimed", "Signed", "In its own words"].map((h) => (
            <th key={h} className="label py-3 font-normal">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id} className="border-b border-hairline align-top">
            <td className="py-3 font-mono text-xs">{m.createdAt.toISOString().slice(11, 19)}</td>
            <td className="py-3">{m.agentName}</td>
            <td className="py-3 font-mono text-xs text-refuse">{m.kind}</td>
            <td className="py-3 font-mono text-xs">
              {m.claimedPaise !== null ? formatInr(m.claimedPaise) : m.claimedDiscountCode ?? "—"}
            </td>
            <td className="py-3 font-mono text-xs">{m.signedPaise !== null ? formatInr(m.signedPaise) : "—"}</td>
            <td className="max-w-[34rem] py-3 text-xs text-fg-2">
              {m.rawAgentText ? `"${m.rawAgentText.replace(/\s+/g, " ").slice(0, 260)}"` : <span className="text-fg-3">not captured</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
