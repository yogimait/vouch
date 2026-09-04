// Gives back what an abandoned checkout is still holding. reserve() always wrote a deadline and
// nothing read it, so an unpaid order held a slice of the mandate forever. This is the reader.
//
// Three callers, because no one of them is enough: `npm run expire` on demand, GET /api/cron/expire
// DAILY (Hobby caps crons at once a day, and a shorter expression fails the deployment outright),
// and opsTick() every tick, so a demo does not wait a day for a fifteen-minute hold.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { writeAudit } from "@/core/audit/log";
import { release } from "@/core/ledger";
import { confirmOrder } from "@/core/orders/confirm";
import { setOrderState } from "@/core/orders/state";

export interface Sweep {
  expired: number;
  /** Found paid at the gateway after all, and settled instead of expired. */
  settled: number;
  releasedPaise: bigint;
}

interface Stale { id: string; razorpay_order_id: string | null }

/** One pass, bounded: each order with a gateway order behind it costs a round trip to Razorpay. */
export async function expireStaleOrders(now: Date = new Date(), limit = 100): Promise<Sweep> {
  const rows = (await getDb().execute(sql`
    select id, razorpay_order_id
      from orders
     where state in ('ADMITTED', 'AWAITING_AUTHORIZATION', 'ESCALATED')
       -- ISO string, not the Date: postgres.js rejects a Date bound through a raw sql template
       -- ("must be of type string or Buffer"), and the cast keeps the comparison in timestamptz.
       and expires_at <= ${now.toISOString()}::timestamptz
     order by expires_at
     limit ${limit}
  `)) as unknown as Stale[];

  const sweep: Sweep = { expired: 0, settled: 0, releasedPaise: 0n };
  for (const row of rows) {
    if (await expireOne(row, sweep)) sweep.expired += 1;
  }
  return sweep;
}

/**
 * The order of these three steps is the correctness property, not a style choice.
 *
 * Ask the gateway first: expiring an order somebody is mid-checkout on is the one way this feature
 * can lose money. Only then move the state, and only release when the state actually moved — two
 * sweeps racing each other must not both give the same hold back.
 */
async function expireOne(row: Stale, sweep: Sweep): Promise<boolean> {
  if (row.razorpay_order_id) {
    // attempts=1: this is a look, not a poll. confirmOrder sleeps 3s between passes and a sweep has
    // no one waiting on it, but it does hold a pooled connection.
    const seen = await confirmOrder(row.id, 1);
    if (seen.status === "PAID") {
      sweep.settled += 1;
      return false;
    }
  }

  const moved = await setOrderState({ orderId: row.id, next: "EXPIRED" });
  if (!moved.changed) return false;

  // reservation_id IS the order id. An escalation never reserved, so this is a clean no-op there
  // rather than a special case.
  const given = await release(row.id);
  if (given.applied) sweep.releasedPaise += given.amountPaise;

  await writeAudit({
    eventType: "ORDER_EXPIRED",
    actor: "guard",
    orderId: row.id,
    payload: {
      from: moved.from,
      releasedPaise: given.applied ? given.amountPaise.toString() : "0",
      reachedGateway: row.razorpay_order_id !== null,
    },
  });

  return true;
}
