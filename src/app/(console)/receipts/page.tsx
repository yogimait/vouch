import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listReceipts, type ReceiptRow } from "@/core/db/queries";
import { receiptsOverview } from "@/core/db/overview/receipts";
import { DataTable, type Column } from "@/components/data-table";
import { ReceiptCards } from "./cards";
import { Empty, Id, Money, Outcome, ScrollPanel, type OutcomeValue } from "../ui";
import { Summary } from "../summary";
import { When } from "../when";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

const COLUMNS: Column<ReceiptRow>[] = [
  { header: "Signed", cell: (r) => <When at={r.signedAt} /> },
  { header: "Receipt", cell: (r) => <Id value={r.id} /> },
  {
    header: "Item",
    cell: (r) => (
      <>
        {r.sku} × {r.qty}
        <div className="text-xs text-fg-3">{r.itemName ?? "—"}</div>
      </>
    ),
  },
  { header: "Amount", align: "right", cell: (r) => <Money paise={r.amountPaise} /> },
  { header: "Decision", cell: (r) => <Outcome value={r.outcome as OutcomeValue} /> },
  { header: "Payment", cell: (r) => <span className="font-mono text-xs text-fg-3">{r.razorpayPaymentId ?? "—"}</span> },
  {
    header: "",
    align: "right",
    cell: (r) => (
      <Button asChild size="sm" variant="outline" className="h-7 rounded-[2px] px-3 text-xs">
        <Link href={`/receipts/${r.orderId}`}>Open</Link>
      </Button>
    ),
  },
];

export default async function ReceiptsPage() {
  // Sequential, not Promise.all: each holds a pooled connection for its whole chain, and the pool
  // is twelve. See the same note in src/core/db/queries.ts — this is the layer that kept undoing it.
  const rows = await listReceipts(200);
  const overview = await receiptsOverview();

  return (
    <>
      <Summary
        title="Receipts"
        subtitle="One per settled order. Signed, block-hashed, and verifiable by anyone holding the file."
      >
        <ReceiptCards overview={overview} />
      </Summary>

      <ScrollPanel title="One receipt per settled order, newest first" count={overview.receipts}>
        <DataTable
          fill
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title="No receipts yet." hint="A receipt is issued the moment an order settles. Run: npm run demo:1" />}
        />
      </ScrollPanel>
    </>
  );
}
