// One settlement path, two ways of learning about it. A webhook carries verified bytes; polling
// carries none, and the receipt says so rather than implying a signature we never checked.
import { writeAudit } from "@/core/audit/log";
import { commit } from "@/core/ledger";
import { setOrderState } from "@/core/orders/state";
import { issueReceipt } from "@/core/receipts/build";

export interface SettleEvidence {
  source: "webhook" | "polled";
  rawBodySha256?: string;
}

export interface Settlement {
  changed: boolean;
  amountPaise: bigint;
  receiptId: string | null;
}

export async function settleOrder(
  orderId: string,
  paymentId: string | null,
  evidence: SettleEvidence,
): Promise<Settlement> {
  const moved = await setOrderState({
    orderId, next: "PAID", razorpayPaymentId: paymentId, settledAt: new Date(),
  });

  // COMMIT only alongside a real transition. A replay finding the order already PAID must not
  // debit the authorization twice.
  if (!moved.changed) return { changed: false, amountPaise: 0n, receiptId: null };

  const done = await commit(orderId);
  await writeAudit({
    eventType: "COMMIT",
    actor: "guard",
    orderId,
    payload: {
      amountPaise: done.amountPaise.toString(),
      applied: done.applied,
      razorpayPaymentId: paymentId,
      evidence: evidence.source,
      rawBodySha256: evidence.rawBodySha256 ?? null,
    },
  });

  // A receipt bug must not become a retry storm — Razorpay retries non-2xx and the money is already
  // committed by here. Issuing is idempotent, so it can be retried from the receipt route.
  let receiptId: string | null = null;
  try {
    const receipt = await issueReceipt(orderId);
    if (receipt.ok) receiptId = receipt.receiptId;
  } catch (error) {
    console.error(`[receipt] ${orderId}`, error);
  }

  return { changed: true, amountPaise: done.amountPaise, receiptId };
}
