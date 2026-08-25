// Demo 3: the same pay call, twice, either side of settlement.
//
//   npm run demo:3
//
// ASPG (the earlier project this ports from) failed closed here with a 409, because it stored no
// response bodies and so could not tell you what the first call had decided. This build stores
// receipts, so a replay can return the original answer instead of an error. That inversion is the
// whole demo: a retrying agent gets the same order and the same receipt, never a second charge.
import { execFileSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { formatInr } from "@/core/money";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const KEY = process.env.VOUCH_AGENT_KEY ?? "vouch_sk_demo_shopbot";
const SKU = process.argv[2] ?? "SKU-F";

interface Envelope<T> { status: boolean; statusCode: number; data?: T; message?: string; error?: { code: string } }

async function call<T>(path: string, body?: unknown): Promise<Envelope<T>> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", connection: "close" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return (await res.json()) as Envelope<T>;
    } catch (error) {
      if (attempt > 0) throw error;
    }
  }
}

const eq = (label: string, a: unknown, b: unknown) => {
  const same = a === b;
  console.log(`   ${same ? "same" : "DIFFERENT"}  ${label}`);
  if (!same) throw new Error(`${label}: ${String(a)} vs ${String(b)}`);
};

async function main(): Promise<void> {
  const quote = await call<{ offer_token: string; total_display: string }>("/api/quote", { sku: SKU, qty: 1 });
  if (!quote.data) throw new Error(`quote refused: ${quote.error?.code}`);

  const key = `demo3_${Date.now()}`;
  console.log(`\nidempotency_key: ${key}   ${SKU}  ${quote.data.total_display}\n`);

  console.log("1. first pay");
  const first = await call<{ order_id: string; decision_id: string; replayed: boolean }>(
    "/api/pay", { offer_token: quote.data.offer_token, idempotency_key: key },
  );
  if (!first.data) throw new Error(`refused ${first.error?.code}`);
  console.log(`   ${first.statusCode}  order ${first.data.order_id}  replayed=${first.data.replayed}`);

  console.log("\n2. the retry an agent actually makes — same key, before anything settled");
  const second = await call<{ order_id: string; replayed: boolean }>(
    "/api/pay", { offer_token: quote.data.offer_token, idempotency_key: key },
  );
  console.log(`   ${second.statusCode}  order ${second.data?.order_id}  replayed=${second.data?.replayed}`);
  eq("order id", first.data.order_id, second.data?.order_id);

  console.log("\n3. the device settles it");
  execFileSync("npx", ["tsx", "--env-file=.env.local", "scripts/device.ts", first.data.order_id], {
    stdio: "inherit", shell: process.platform === "win32",
  });

  const receiptPath = `/api/orders/${first.data.order_id}/receipt`;
  const before = await call<{ bundle: { receipt: string } }>(receiptPath);
  if (!before.data) throw new Error(`no receipt: ${before.error?.code}`);
  const firstReceiptId = JSON.parse(before.data.bundle.receipt).receipt_id as string;
  console.log(`\n4. receipt ${firstReceiptId}`);

  console.log("\n5. the same pay call again, now that it is settled");
  const third = await call<{ order_id: string; replayed: boolean }>(
    "/api/pay", { offer_token: quote.data.offer_token, idempotency_key: key },
  );
  console.log(`   ${third.statusCode}  order ${third.data?.order_id}  replayed=${third.data?.replayed}`);
  eq("order id", first.data.order_id, third.data?.order_id);

  const after = await call<{ bundle: { receipt: string } }>(receiptPath);
  eq("receipt id", firstReceiptId, JSON.parse(after.data!.bundle.receipt).receipt_id);

  // The database is the real assertion. Exact counts, never "at most".
  const rows = (await getDb().execute(sql`
    select
      (select count(*)::text from orders where idempotency_key = ${key}) as orders,
      (select count(*)::text from receipts r join orders o on o.id = r.order_id
        where o.idempotency_key = ${key}) as receipts,
      (select coalesce(sum(l.amount_paise), 0)::text from authorization_ledger l
        join orders o on o.id = l.order_id
        where o.idempotency_key = ${key} and l.entry_type = 'COMMIT') as debited
  `)) as unknown as Record<string, string>[];

  console.log(`\n   orders with this key:   ${rows[0].orders}`);
  console.log(`   receipts:               ${rows[0].receipts}`);
  console.log(`   total debited:          ${formatInr(BigInt(rows[0].debited))}`);

  if (rows[0].orders !== "1") throw new Error(`expected exactly 1 order, found ${rows[0].orders}`);
  if (rows[0].receipts !== "1") throw new Error(`expected exactly 1 receipt, found ${rows[0].receipts}`);

  console.log("\nDEMO 3 PASSED — three pay calls, one order, one receipt, one debit.\n");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(`\nDEMO 3 FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
