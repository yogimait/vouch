import Link from "next/link";
import { listReceipts, type ReceiptRow } from "@/core/db/queries";
import { DataTable, type Column } from "@/components/data-table";
import { Empty, Id, Money, Outcome, PageHeading, type OutcomeValue } from "../ui";

export const dynamic = "force-dynamic";

const COLUMNS: Column<ReceiptRow>[] = [
  { header: "Signed", cell: (r) => <span className="font-mono text-xs">{r.signedAt.toISOString().slice(5, 16).replace("T", " ")}</span> },
  { header: "Receipt", cell: (r) => <Id value={r.id} /> },
  { header: "Item", cell: (r) => `${r.sku} × ${r.qty}` },
  { header: "Amount", align: "right", cell: (r) => <Money paise={r.amountPaise} /> },
  { header: "Decision", cell: (r) => <Outcome value={r.outcome as OutcomeValue} /> },
  { header: "Payment", cell: (r) => <span className="font-mono text-xs text-fg-3">{r.razorpayPaymentId ?? "—"}</span> },
  {
    header: "",
    align: "right",
    cell: (r) => <Link href={`/receipts/${r.orderId}`} className="text-xs text-primary hover:underline">open</Link>,
  },
];

export default async function ReceiptsPage() {
  const rows = await listReceipts();

  return (
    <>
      <PageHeading
        title="Receipts"
        subtitle="One per settled order. Signed, block-hashed, and verifiable by anyone holding the file."
      />
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        empty={<Empty title="No receipts yet." hint="A receipt is issued the moment an order settles. Run: npm run demo:1" />}
      />
    </>
  );
}
