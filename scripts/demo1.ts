// Demo 1: an agent buys something, end to end, over real HTTP.
//
//   npm run dev            (in another terminal)
//   npm run demo:1
//
// Nothing is stubbed. The agent holds an API key and no payment credential; the device holds the
// credential and never sees the catalogue. That separation is the point.
import { execFileSync } from "node:child_process";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const KEY = process.env.VOUCH_AGENT_KEY ?? "vouch_sk_demo_shopbot";
const SKU = process.argv[2] ?? "SKU-C";

interface Envelope<T> { status: boolean; statusCode: number; data?: T; message?: string; error?: { code: string; details?: Record<string, unknown> } }

async function call<T>(path: string, body?: unknown): Promise<Envelope<T>> {
  // Retried once: the device step takes ~90s, and undici happily reuses a keep-alive socket the
  // server has since dropped. That surfaces as a bare "fetch failed" with no status to read.
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

function step(n: number, what: string): void {
  console.log(`\n${n}. ${what}`);
}

async function main(): Promise<void> {
  step(1, "the agent browses the catalogue");
  const catalog = await call<{ items: { sku: string; name: string; unit_price_display: string; promo_text: string | null }[] }>("/api/catalog");
  const item = catalog.data?.items.find((i) => i.sku === SKU);
  if (!item) throw new Error(`${SKU} not in catalogue`);
  console.log(`   ${item.sku}  ${item.name}  ${item.unit_price_display}`);

  step(2, "the agent asks for a signed price");
  const quote = await call<{ offer_id: string; offer_token: string; total_display: string; expires_at: string }>(
    "/api/quote", { sku: SKU, qty: 1 },
  );
  if (!quote.data) throw new Error(`quote refused: ${quote.error?.code}`);
  console.log(`   ${quote.data.offer_id}  ${quote.data.total_display}  expires ${quote.data.expires_at.slice(11, 19)}`);
  console.log(`   token ${quote.data.offer_token.slice(0, 48)}...`);

  step(3, "the agent pays — note there is no amount to send");
  const paid = await call<{ order_id: string; authorization_url: string; decision_id: string }>(
    "/api/pay", { offer_token: quote.data.offer_token, idempotency_key: `demo1_${quote.data.offer_id}` },
  );
  if (!paid.data) throw new Error(`refused ${paid.error?.code}: ${paid.message}`);
  console.log(`   ${paid.statusCode} ADMIT  order ${paid.data.order_id}  decision ${paid.data.decision_id}`);
  console.log(`   authorization_url ${paid.data.authorization_url}`);

  step(4, "the same call again, same idempotency key");
  const again = await call<{ order_id: string; replayed: boolean }>(
    "/api/pay", { offer_token: quote.data.offer_token, idempotency_key: `demo1_${quote.data.offer_id}` },
  );
  const same = again.data?.order_id === paid.data.order_id;
  console.log(`   order ${again.data?.order_id}  replayed=${again.data?.replayed}  same order: ${same ? "yes" : "NO"}`);
  if (!same) throw new Error("idempotency broken: a second call created a different order");

  step(5, "the device authorises it — the agent never holds a credential");
  execFileSync("npx", ["tsx", "--env-file=.env.local", "scripts/device.ts", paid.data.order_id], {
    stdio: "inherit", shell: process.platform === "win32",
  });

  step(6, "the agent fetches its receipt");
  const receipt = await call<{ verification: { valid: boolean; signature_valid: boolean; tampered_blocks: string[] } }>(
    `/api/orders/${paid.data.order_id}/receipt`,
  );
  if (!receipt.data) throw new Error(`no receipt: ${receipt.error?.code}`);
  const v = receipt.data.verification;
  console.log(`   valid=${v.valid}  signature=${v.signature_valid}  tampered=${v.tampered_blocks.length ? v.tampered_blocks.join(",") : "none"}`);
  if (!v.valid) throw new Error("receipt does not verify");

  console.log("\nDEMO 1 PASSED\n");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(`\nDEMO 1 FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
