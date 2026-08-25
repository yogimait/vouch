import Link from "next/link";
import { listReceipts } from "@/core/db/queries";
import { Empty, Id, Money, Outcome, PageHeading } from "../ui";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const rows = await listReceipts();

  return (
    <>
      <PageHeading
        title="Receipts"
        subtitle="One per settled order. Signed, block-hashed, and verifiable by anyone holding the file."
      />

      {rows.length === 0 ? (
        <Empty title="No receipts yet." hint="A receipt is issued the moment an order settles. Run: npm run demo:1" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              {["Signed", "Receipt", "Item", "Amount", "Decision", "Payment", ""].map((h) => (
                <th key={h} className="label py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-hairline">
                <td className="py-3 font-mono text-xs">{r.signedAt.toISOString().slice(5, 16).replace("T", " ")}</td>
                <td className="py-3"><Id value={r.id} /></td>
                <td className="py-3">{r.sku} × {r.qty}</td>
                <td className="py-3 text-right"><Money paise={r.amountPaise} /></td>
                <td className="py-3"><Outcome value={r.outcome as "ADMIT"} /></td>
                <td className="py-3 font-mono text-xs text-fg-3">{r.razorpayPaymentId ?? "—"}</td>
                <td className="py-3 text-right">
                  <Link href={`/receipts/${r.orderId}`} className="text-xs text-accent hover:underline">open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
