// Real settlements against Razorpay test mode.
//
//   npm run dev                (in another terminal)
//   npm run settle [count]     default 10 successes + 2 forced failures
//
// These numbers are NOT the harness numbers and must never be added to them. The harness measures
// the gate — 210 decisions, no network. This measures settlement — a couple of dozen real payments
// through a real gateway. Mixing them would turn "we decided 210 times" into a claim about money
// that never moved.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { orders } from "@/core/db/schema";
import { formatInr } from "@/core/money";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const KEY = process.env.VOUCH_AGENT_KEY ?? "vouch_sk_demo_shopbot";
const COUNT = Number(process.argv[2] ?? 10);
const FAILURES = 2;

// Cheap items, so a dozen settlements fit inside one Rs 9,000 authorization.
const SKUS = ["SKU-O", "SKU-F", "SKU-E", "SKU-D"];

interface Envelope<T> { statusCode: number; data?: T; message?: string; error?: { code: string } }

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

async function admit(sku: string, tag: string): Promise<string | null> {
  const quote = await call<{ offer_token: string }>("/api/quote", { sku, qty: 1 });
  if (!quote.data) {
    console.error(`   ${tag} ${sku}: quote refused ${quote.error?.code}`);
    return null;
  }
  const paid = await call<{ order_id: string }>("/api/pay", {
    offer_token: quote.data.offer_token, idempotency_key: `settle_${tag}_${Date.now()}`, label: "settle",
  });
  if (!paid.data) {
    console.error(`   ${tag} ${sku}: refused ${paid.error?.code}`);
    return null;
  }
  return paid.data.order_id;
}

/** One browser session for the whole batch, not one per order. */
function drive(ids: string[], fail: boolean): void {
  for (const id of ids) {
    execFileSync("npx", ["tsx", "--env-file=.env.local", "scripts/device.ts", id, ...(fail ? ["--fail"] : [])], {
      stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32",
    });
  }
}

async function main(): Promise<void> {
  console.log(`\nadmitting ${COUNT} orders and ${FAILURES} that will be made to fail\n`);

  const good: string[] = [];
  for (let i = 0; i < COUNT; i++) {
    const id = await admit(SKUS[i % SKUS.length], `ok${i}`);
    if (id) good.push(id);
  }
  if (good.length < COUNT) console.log(`   ${COUNT - good.length} refused at admit — the authorization ran out of headroom`);

  console.log(`\n${good.length} to settle. Driving the device.\n`);
  drive(good, false);

  // Admitted only now: admitting all twelve up front holds all twelve at once, and the last two
  // were refused for headroom that the first ten had not yet committed or released.
  const bad: string[] = [];
  for (let i = 0; i < FAILURES; i++) {
    const id = await admit(SKUS[i % SKUS.length], `fail${i}`);
    if (id) bad.push(id);
  }
  console.log(`\n${bad.length} to fail. Driving the device with a card this business rejects.\n`);
  drive(bad, true);

  const all = [...good, ...bad];
  const rows = await getDb().select().from(orders).where(inArray(orders.id, all));

  console.log(`\n  SETTLEMENT — real payments through Razorpay test mode`);
  console.log(`  ${"order".padEnd(30)}${"amount".padStart(11)}   ${"state".padEnd(8)} payment`);
  console.log(`  ${"-".repeat(76)}`);
  for (const o of rows) {
    console.log(`  ${o.id.padEnd(30)}${formatInr(o.amountPaise).padStart(11)}   ${o.state.padEnd(8)} ${o.razorpayPaymentId ?? "-"}`);
  }

  const paid = rows.filter((o) => o.state === "PAID");
  const failed = rows.filter((o) => o.state === "FAILED");

  const [ledger] = (await getDb().execute(sql`
    select
      coalesce(sum(amount_paise) filter (where entry_type = 'COMMIT'), 0)::text  as committed,
      coalesce(sum(amount_paise) filter (where entry_type = 'RELEASE'), 0)::text as released
    from authorization_ledger where order_id = any(${sql.raw(`ARRAY[${all.map((i) => `'${i}'`).join(",")}]`)})
  `)) as unknown as Record<string, string>[];

  console.log(`  ${"-".repeat(76)}`);
  console.log(`  settled ${paid.length}   failed ${failed.length}   of ${rows.length} attempted`);
  console.log(`  debited ${formatInr(BigInt(ledger.committed))}   released ${formatInr(BigInt(ledger.released))}`);
  console.log(`\n  These are settlement numbers. The gate numbers are in npm run harness, and the two`);
  console.log(`  are never shown as one figure.\n`);

  mkdirSync("evidence", { recursive: true });
  writeFileSync("evidence/settlements.json", JSON.stringify({
    attempted: rows.length, settled: paid.length, failed: failed.length,
    debitedPaise: ledger.committed, releasedPaise: ledger.released,
    orders: rows.map((o) => ({ id: o.id, amountPaise: o.amountPaise.toString(), state: o.state, razorpayPaymentId: o.razorpayPaymentId })),
  }, null, 2));
  console.log(`  written to evidence/settlements.json\n`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
