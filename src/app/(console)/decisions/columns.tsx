import Link from "next/link";
import type { DecisionRow } from "@/core/db/queries";
import { Badge } from "@/components/ui/badge";
import DecryptedText from "@/components/ui/decrypted-text";
import type { Column } from "@/components/data-table";
import { asMoney, Id, latency, Money, Outcome } from "../ui";
import { When } from "../when";

export const DECISION_COLUMNS: Column<DecisionRow>[] = [
  { header: "When", cell: (d) => <When at={d.createdAt} /> },
  {
    header: "Agent",
    cell: (d) => (
      <>
        {d.agentName}
        <div><Id value={d.agentId} /></div>
      </>
    ),
  },
  {
    header: "Item",
    cell: (d) => (
      <>
        {d.sku ? `${d.sku} × ${d.qty}` : "—"}
        <div className="text-xs text-fg-3">{d.itemName}</div>
      </>
    ),
  },
  { header: "Amount", align: "right", cell: (d) => (d.amountPaise === null ? "—" : <Money paise={d.amountPaise} />) },
  {
    header: "Outcome",
    // An admitted order is not a paid one. The badge is the way to the page where a person
    // finishes it, because the agent holds no credential and the row is otherwise a dead end.
    cell: (d) =>
      d.orderId ? (
        <Link href={`/pay/${d.orderId}`} className="feedback hover:underline">
          <Outcome value={d.outcome} />
        </Link>
      ) : (
        <Outcome value={d.outcome} />
      ),
  },
  {
    header: "Reason",
    wrap: true,
    className: "max-w-[26rem]",
    cell: (d, i) =>
      d.reasons[0] && (
        <>
          {/* Only the newest row decodes. One is a signal; two hundred is two hundred client
              components with their own observers, and it took the page from 0.5s to 5.4s. */}
          {i === 0 ? (
            <DecryptedText
              text={d.reasons[0].code}
              animateOn="view"
              sequential
              speed={22}
              className="font-mono text-xs"
              encryptedClassName="font-mono text-xs text-fg-3"
            />
          ) : (
            <span className="font-mono text-xs">{d.reasons[0].code}</span>
          )}
          {d.reasons[0].observed && (
            <div className="text-xs text-fg-3">
              asked {asMoney(d.reasons[0].observed)} · limit {asMoney(d.reasons[0].expected)}
            </div>
          )}
        </>
      ),
  },
  { header: "Latency", align: "right", cell: (d) => <span className="font-mono text-xs">{latency(d.latencyMs)}</span> },
  {
    header: "Source",
    cell: (d) => <Badge variant="outline" className="rounded-[2px] font-mono text-fg-3">{d.source}</Badge>,
  },
];
