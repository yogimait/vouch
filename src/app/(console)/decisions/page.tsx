import { decisionTotals, listDecisions } from "@/core/db/queries";
import { Empty, Id, Money, Outcome, PageHeading, StatTile } from "../ui";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const [rows, totals] = await Promise.all([listDecisions(), decisionTotals()]);

  return (
    <>
      <PageHeading title="Decisions" subtitle="Every admission decision, including refusals that never became an order." />

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="decisions" value={String(totals.total)} />
        <StatTile label="admitted" value={String(totals.admit)} accent="ADMIT" />
        <StatTile label="escalated" value={String(totals.escalate)} accent="ESCALATE" />
        <StatTile label="refused" value={String(totals.refuse)} accent="REFUSE" />
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No decisions yet."
          hint="Decisions appear the moment an agent calls pay. Run: npm run demo:1"
        />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              {["Time", "Agent", "Item", "Amount", "Outcome", "Reason", "Latency", "Source"].map((h) => (
                <th key={h} className="label py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-hairline align-top">
                <td className="py-3 font-mono text-xs">{d.createdAt.toISOString().slice(11, 19)}</td>
                <td className="py-3">{d.agentName}<div><Id value={d.agentId} /></div></td>
                <td className="py-3">{d.sku ? `${d.sku} × ${d.qty}` : "—"}<div className="text-xs text-fg-3">{d.itemName}</div></td>
                <td className="py-3 text-right">{d.amountPaise === null ? "—" : <Money paise={d.amountPaise} />}</td>
                <td className="py-3"><Outcome value={d.outcome} /></td>
                <td className="max-w-[26rem] py-3">
                  {d.reasons[0] && (
                    <>
                      <div className="font-mono text-xs">{d.reasons[0].code}</div>
                      {d.reasons[0].observed && (
                        <div className="text-xs text-fg-3">asked {d.reasons[0].observed} · limit {String(d.reasons[0].expected)}</div>
                      )}
                    </>
                  )}
                </td>
                <td className="py-3 font-mono text-xs">{d.latencyMs}ms</td>
                <td className="py-3"><span className="rounded border border-hairline px-2 py-0.5 font-mono text-xs text-fg-3">{d.source}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
