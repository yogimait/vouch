// A person saying no to an escalation.
//
// An escalation used to have exactly one outcome: pay it. Declining meant walking away and letting
// the order sit until the sweeper took it, which records a timeout — and a timeout and a refusal are
// not the same fact about a business.
import { eq } from "drizzle-orm";
import { getDb } from "@/core/db";
import { orders } from "@/core/db/schema";
import { failOrder } from "@/core/orders/settle";

export type Decline =
  | { ok: true; releasedPaise: string; alreadyClosed: boolean }
  | { ok: false; code: "ORDER_UNKNOWN" | "ORDER_NOT_ESCALATED" };

// ponytail: a decline is FAILED with a reason, not a state of its own. The distinguisher is
// failure_reason plus the audit row it writes; a DECLINED enum value costs a migration and touches
// every metrics query. Promote it if a dispute ever needs to sort on it.
const REASON = "declined by the approver";

/** Only an escalation can be declined: nothing else was ever waiting on a person's answer. */
export async function declineOrder(orderId: string): Promise<Decline> {
  const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false, code: "ORDER_UNKNOWN" };
  if (order.state !== "ESCALATED") return { ok: false, code: "ORDER_NOT_ESCALATED" };

  const failed = await failOrder(orderId, REASON, { source: "human" });
  return {
    ok: true,
    releasedPaise: failed.releasedPaise.toString(),
    // An escalation holds nothing, so this is almost always zero — said out loud rather than left
    // to look like a bug on the page that prints it.
    alreadyClosed: !failed.changed,
  };
}
