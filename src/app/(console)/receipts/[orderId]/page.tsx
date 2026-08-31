import Link from "next/link";
import { orderItem } from "@/core/db/queries";
import type { ReceiptBody } from "@/core/receipts/build";
import { verifyStored } from "@/core/receipts/verify";
import { demoEnabled } from "@/demo/route";
import { ReceiptFacts } from "./cards";
import { Blocks } from "../blocks";
import { TamperControl } from "./tamper";
import { PageHeading, ScrollPanel } from "../../ui";
import { Summary } from "../../summary";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  // Verified on every view, not at issue time. A receipt nobody re-checks is a stored assertion.
  const loaded = await verifyStored(orderId);

  if (!loaded.ok) {
    return <><PageHeading title="Receipt" subtitle="No receipt exists for that order." /><Link href="/receipts" className="text-sm text-primary">back</Link></>;
  }

  const body = JSON.parse(loaded.bundle.receipt) as ReceiptBody;
  // What was bought leads. The receipt id is an identifier; the product is what a human recognises.
  const item = await orderItem(orderId);
  const bought = item ? `${item.sku} × ${item.qty}` : "";

  return (
    <>
      {/* Summary, not PageHeading: four content-rich cards and six blocks do not both fit the pinned
          console height, and this was the one ledger page with no way to fold the cards away. */}
      <Summary
        title={item?.name ?? body.receipt_id}
        subtitle={`${bought} · receipt ${short(body.receipt_id)} · order ${short(orderId)} · signed with ${loaded.bundle.key_id}`}
      >
        <ReceiptFacts body={body} verification={loaded.verification} />
      </Summary>

      <ScrollPanel title="Six blocks, each hashed on its own" count={6} bodyClassName="p-4">
        <Blocks blocks={body.blocks} hashes={body.block_hashes} tampered={loaded.verification.tamperedBlocks} />
        <p className="mt-6 text-xs text-fg-3">
          Export it with <span className="font-mono">npm run receipt export {orderId}</span> — the bundle carries
          the public key, so it verifies with no database, no keys and no network.
        </p>
        <TamperControl orderId={orderId} enabled={demoEnabled()} />
      </ScrollPanel>
    </>
  );
}

function short(id: string): string {
  return id.length <= 20 ? id : `${id.slice(0, 10)}…${id.slice(-6)}`;
}
