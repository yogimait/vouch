// CLI wrapper. The seed itself is a module so importing DEMO_KEYS cannot truncate a database.
//
// Guarded, because seed() TRUNCATEs fourteen tables and this has destroyed the evidence twice: the
// receipts and the audit chain are the product, they take real Razorpay captures to rebuild, and
// there is no undo. A database that has settled money says so, and asks to be told twice.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { seed } from "@/core/db/seed";

async function main(): Promise<void> {
  const [row] = (await getDb().execute(sql`
    select (select count(*) from receipts)::text as receipts,
           (select count(*) from orders where state = 'PAID')::text as paid
  `)) as unknown as { receipts: string; paid: string }[];

  const receipts = Number(row.receipts);
  if (receipts > 0 && !process.argv.includes("--force")) {
    console.error(`\n  Refusing to seed: ${receipts} signed receipt${receipts === 1 ? "" : "s"} and `
      + `${row.paid} settled order${row.paid === "1" ? "" : "s"} are in this database.`);
    console.error("  Seeding truncates fourteen tables, including receipts and audit_log, and they");
    console.error("  cost real Razorpay captures to rebuild.\n");
    console.error("  If that is genuinely what you want:  npm run db:seed -- --force\n");
    process.exit(1);
  }

  await seed();
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("seed failed:", error);
  process.exit(1);
});
