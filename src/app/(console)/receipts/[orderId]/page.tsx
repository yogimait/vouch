import Link from "next/link";
import { verifyStored } from "@/core/receipts/verify";
import { Blocks } from "../blocks";
import { PageHeading, Verdict } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  // Verified on every view, not at issue time. A receipt nobody re-checks is a stored assertion.
  const loaded = await verifyStored(orderId);

  if (!loaded.ok) {
    return <><PageHeading title="Receipt" subtitle="No receipt exists for that order." /><Link href="/receipts" className="text-sm text-primary">back</Link></>;
  }

  const body = JSON.parse(loaded.bundle.receipt);
  const v = loaded.verification;

  return (
    <>
      <PageHeading title={body.receipt_id} subtitle={`Order ${orderId} · signed with ${loaded.bundle.key_id}`} />
      <Verdict
        valid={v.valid}
        signatureValid={v.signatureValid}
        tampered={v.tamperedBlocks}
        chain={v.chain}
      />
      <Blocks blocks={body.blocks} hashes={body.block_hashes} tampered={v.tamperedBlocks} />
      <p className="mt-8 text-xs text-fg-3">
        Export it with <span className="font-mono">npm run receipt export {orderId}</span> — the bundle carries the
        public key, so it verifies with no database, no keys and no network.
      </p>
    </>
  );
}
