// Gives back what abandoned checkouts are still holding.
//
//   npm run expire        one pass over everything past its deadline
//
// Same function the cron route calls. Run it by hand when you want to watch it work.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { expireStaleOrders } from "@/core/orders/expire";
import { formatInr } from "@/core/money";

async function pending(): Promise<{ id: string; state: string; amount: string }[]> {
  return (await getDb().execute(sql`
    select id, state, amount_paise::text as amount
      from orders
     where state in ('ADMITTED', 'AWAITING_AUTHORIZATION', 'ESCALATED')
       and expires_at <= now()
     order by expires_at
  `)) as unknown as { id: string; state: string; amount: string }[];
}

async function main(): Promise<void> {
  const due = await pending();
  console.log(`\n  ${due.length} order${due.length === 1 ? "" : "s"} past the deadline\n`);
  for (const o of due) {
    console.log(`  ${o.id.padEnd(30)} ${o.state.padEnd(24)} ${formatInr(BigInt(o.amount)).padStart(12)}`);
  }
  if (due.length === 0) return;

  console.log(`  ${"-".repeat(70)}`);
  const sweep = await expireStaleOrders();
  console.log(`  expired ${sweep.expired}   settled ${sweep.settled}   released ${formatInr(sweep.releasedPaise)}`);
  // Said out loud: the sweeper asks Razorpay before it expires anything, so an order found paid is
  // settled rather than swept. A count of 0 expired and 1 settled is the feature working.
  console.log(`\n  Released money is a hold coming back, never a refund. Nothing here was debited.\n`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
