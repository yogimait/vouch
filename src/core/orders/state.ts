// The only place an order's state changes. One map, so an illegal transition is impossible to write
// by accident and a replayed webhook cannot walk a settled order backwards.
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { orders } from "@/core/db/schema";

export type OrderState = (typeof orders.$inferSelect)["state"];

const TRANSITIONS: Record<OrderState, OrderState[]> = {
  ADMITTED: ["AWAITING_AUTHORIZATION", "ESCALATED", "FAILED", "EXPIRED"],
  AWAITING_AUTHORIZATION: ["PAID", "FAILED", "EXPIRED"],
  ESCALATED: ["PAID", "FAILED", "EXPIRED"],
  PAID: [],
  FAILED: [],
  // Not terminal, and deliberately so. A capture can land after the deadline -- a late webhook, a
  // payer finishing at minute sixteen -- and if PAID were unreachable from here settleOrder would
  // bail with changed:false: money taken at Razorpay, no COMMIT, no receipt. The ledger survives
  // that either way (a RELEASE and a later COMMIT both land and the debit still stands); the order
  // and its receipt would not.
  EXPIRED: ["PAID"],
};

export interface StateChange {
  changed: boolean;
  from: OrderState | null;
  to: OrderState;
}

export interface SetStateInput {
  orderId: string;
  next: OrderState;
  razorpayPaymentId?: string | null;
  failureReason?: string | null;
  settledAt?: Date | null;
}

/**
 * Row-locked read-then-write. A repeat of the current state is a no-op, not an error: Razorpay
 * retries any non-2xx, so a webhook that throws on replay becomes a retry storm.
 */
export async function setOrderState(input: SetStateInput): Promise<StateChange> {
  return getDb().transaction(async (tx) => {
    const [row] = (await tx.execute(sql`
      select state from orders where id = ${input.orderId} for update
    `)) as unknown as { state: OrderState }[];

    if (!row) return { changed: false, from: null, to: input.next };
    if (row.state === input.next) return { changed: false, from: row.state, to: input.next };
    if (!TRANSITIONS[row.state].includes(input.next)) {
      return { changed: false, from: row.state, to: input.next };
    }

    await tx.update(orders).set({
      state: input.next,
      updatedAt: new Date(),
      ...(input.razorpayPaymentId !== undefined ? { razorpayPaymentId: input.razorpayPaymentId } : {}),
      ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
      ...(input.settledAt !== undefined ? { settledAt: input.settledAt } : {}),
    }).where(eq(orders.id, input.orderId));

    return { changed: true, from: row.state, to: input.next };
  });
}

export function canTransition(from: OrderState, to: OrderState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(state: OrderState): boolean {
  return TRANSITIONS[state].length === 0;
}
