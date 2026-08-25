// One settlement path, two ways of learning about it. A webhook carries verified bytes; polling
// carries none, and the receipt says so rather than implying a signature we never checked.
import { writeAudit } from "@/core/audit/log";
import { commit, release } from "@/core/ledger";
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

/**
 * The mirror of settleOrder. A failed payment must give the hold back however we learn about it —
 * a webhook that reached us, or a poll that found the payment failed. Money left held by a failure
 * silently shrinks what the agent may spend, with no debit anywhere to explain it.
 */
export async function failOrder(
  orderId: string,
  reason: string,
  evidence: SettleEvidence,
): Promise<{ changed: boolean; releasedPaise: bigint }> {
  const moved = await setOrderState({ orderId, next: "FAILED", failureReason: reason.slice(0, 500) });
  if (!moved.changed) return { changed: false, releasedPaise: 0n };

  const given = await release(orderId);
  await writeAudit({
    eventType: "RELEASE",
    actor: "guard",
    orderId,
    payload: {
      amountPaise: given.amountPaise.toString(),
      applied: given.applied,
      reason,
      evidence: evidence.source,
    },
  });

  return { changed: true, releasedPaise: given.applied ? given.amountPaise : 0n };
}
