// Demo 4: the agent is refused, and a person completes the same purchase.
//
//   npm run demo:4
//
// ESCALATE is 202, not an error. The request was legitimate and simply exceeded what THIS agent was
// delegated, so it returns a payment link a human can open. Nothing is held against the
// authorization: the agent's allowance is not spent by a decision the agent was not allowed to make.
//
// The link the human opens is the same mechanism the device uses for an ADMIT. One rail, two
// authorizers — that is what makes escalation cheap rather than a separate subsystem.
import { execFileSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { formatInr } from "@/core/money";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const KEY = process.env.VOUCH_AGENT_KEY ?? "vouch_sk_demo_shopbot";
// 4 x Rs 3,500 = Rs 14,000, over the Rs 11,000 per-order cap. Headroom alone would escalate at
// Rs 9,000, so the quantity has to clear that too or the wrong rule takes the credit.
const SKU = process.argv[2] ?? "SKU-A";
const QTY = Number(process.argv[3] ?? 4);

interface Reason { code: string; observed?: string; expected?: string; rule?: string }
interface Envelope<T> { status: boolean; statusCode: number; data?: T; message?: string; error?: { code: string; details?: Record<string, unknown> } }

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

async function main(): Promise<void> {
  const quote = await call<{ offer_token: string; total_display: string; total_paise: string }>(
    "/api/quote", { sku: SKU, qty: QTY },
  );
  if (!quote.data) throw new Error(`quote refused: ${quote.error?.code}`);
  console.log(`\n1. the agent quotes ${SKU} at ${quote.data.total_display}`);

  console.log("\n2. it tries to pay");
  const attempt = await call<{ order_id: string; payment_link: string; decision_id: string; reasons: Reason[] }>(
    "/api/pay", { offer_token: quote.data.offer_token, idempotency_key: `demo4_${Date.now()}` },
  );
  if (attempt.statusCode !== 202) {
    throw new Error(`expected 202 ESCALATE, got ${attempt.statusCode} ${attempt.error?.code ?? ""}`);
  }

  const reason = attempt.data!.reasons[0];
  console.log(`   ${attempt.statusCode}  ESCALATE  ${reason.code}  (rule ${reason.rule})`);
  console.log(`   asked ${formatInr(BigInt(reason.observed!))} against a per-order limit of ${formatInr(BigInt(reason.expected!))}`);
  console.log(`   ${attempt.message}`);
  console.log(`   ${attempt.data!.payment_link}`);

  const orderId = attempt.data!.order_id;

  // Nothing may be held: this is not the agent's spend to make.
  const held = (await getDb().execute(sql`
    select coalesce(sum(amount_paise), 0)::text as n from authorization_ledger where order_id = ${orderId}
  `)) as unknown as { n: string }[];
  console.log(`\n3. held against the authorization: ${formatInr(BigInt(held[0].n))}`);
  if (held[0].n !== "0") throw new Error(`ESCALATE must hold nothing, held ${held[0].n}`);

  console.log("\n4. a person opens that same link and pays it");
  execFileSync("npx", ["tsx", "--env-file=.env.local", "scripts/device.ts", orderId], {
    stdio: "inherit", shell: process.platform === "win32",
  });

  const [order] = (await getDb().execute(sql`
    select state, razorpay_payment_id from orders where id = ${orderId}
  `)) as unknown as Record<string, string>[];
  console.log(`\n5. order ${orderId} is ${order.state}  (${order.razorpay_payment_id})`);
  if (order.state !== "PAID") throw new Error(`expected PAID, got ${order.state}`);

  const receipt = await call<{ bundle: { receipt: string }; verification: { valid: boolean } }>(
    `/api/orders/${orderId}/receipt`,
  );
  if (!receipt.data) throw new Error(`no receipt: ${receipt.error?.code}`);
  const body = JSON.parse(receipt.data.bundle.receipt);

  console.log(`\n6. the receipt records what actually happened, not a tidied version:`);
  console.log(`   decision outcome   ${body.blocks.decision.outcome}`);
  console.log(`   reason             ${body.blocks.decision.reasons[0]?.code}`);
  console.log(`   verifies           ${receipt.data.verification.valid}`);

  if (body.blocks.decision.outcome !== "ESCALATE") {
    throw new Error(`receipt must show the ESCALATE, got ${body.blocks.decision.outcome}`);
  }
  if (!receipt.data.verification.valid) throw new Error("receipt does not verify");

  console.log("\nDEMO 4 PASSED — refused for the agent, paid by a human, and the receipt says so.\n");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(`\nDEMO 4 FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
