// The acceptance test for day 4: a webhook delivered twice must debit the authorization once.
// Razorpay retries, so this is not a hypothetical.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

// Set before any import of @/core/env: env() caches its first successful parse.
const SECRET = "test_webhook_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

function signed(body: unknown): { raw: string; signature: string } {
  const raw = JSON.stringify(body);
  return { raw, signature: createHmac("sha256", SECRET).update(raw).digest("hex") };
}

// The shape Razorpay actually sends. order_id is what binds a payment to an order -- notes are
// client-supplied at checkout and cannot be the binding on their own.
function capturedEvent(orderId: string, paymentId: string, over: { order_id?: string; amount?: number } = {}) {
  return {
    event: "payment.captured",
    payload: { payment: { entity: {
      id: paymentId,
      order_id: over.order_id ?? `order_WH${stamp}`,
      amount: over.amount ?? Number(AMOUNT),
      notes: { vouch_order_id: orderId },
    } } },
  };
}

const stamp = Date.now();
const AMOUNT = 250_00n;

suite("razorpay webhook", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let ledger: typeof import("@/core/ledger");
  let handleWebhook: typeof import("@/core/orders/webhook").handleWebhook;

  const MAX = 1000_00n;
  const authId = `auth_WH${stamp}`;
  const offerId = `off_WH${stamp}`;
  const orderId = `ord_WH${stamp}`;

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    ledger = await import("@/core/ledger");
    handleWebhook = (await import("@/core/orders/webhook")).handleWebhook;

    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const [agent] = await db.select().from(schema.buyerAgents).limit(1);
    const [item] = await db.select().from(schema.catalogItems).limit(1);
    if (!merchant || !agent || !item) throw new Error("Run `npm run db:seed` first.");

    await db.insert(schema.authorizations).values({
      id: authId, agentId: agent.id, merchantId: merchant.id,
      maxAmountPaise: MAX, maxPerOrderPaise: MAX,
      expireAt: new Date(Date.now() + 86_400_000),
      grantedBy: "test", grantedVia: "test", grantSignature: "test",
    });
    await db.insert(schema.offers).values({
      id: offerId, merchantId: merchant.id, agentId: agent.id, authorizationId: authId,
      sku: item.sku, qty: 1, unitPricePaise: AMOUNT, totalPaise: AMOUNT,
      nonce: `nonce_WH${stamp}`, token: `token_WH${stamp}`,
      expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.orders).values({
      id: orderId, agentId: agent.id, authorizationId: authId, offerId,
      idempotencyKey: `idem_WH${stamp}`, amountPaise: AMOUNT, state: "AWAITING_AUTHORIZATION",
      razorpayOrderId: `order_WH${stamp}`,
    });
    await ledger.reserve({
      authorizationId: authId, orderId, reservationId: orderId,
      amountPaise: AMOUNT, maxAmountPaise: MAX, expiresAt: new Date(Date.now() + 600_000),
    });
  });

  afterAll(async () => {
    // Settling now issues a receipt, and receipts reference orders.
    await db.execute(sql`delete from receipts where order_id = ${orderId}`);
    await db.execute(sql`delete from webhook_events where order_id = ${orderId}`);
    await db.execute(sql`delete from audit_log where order_id = ${orderId}`);
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.delete(schema.orders).where(eq(schema.orders.id, orderId));
    await db.delete(schema.offers).where(eq(schema.offers.id, offerId));
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("refuses an unsigned body and still keeps it as evidence", async () => {
    const raw = JSON.stringify({ event: "payment.captured", payload: {} });
    const result = await handleWebhook(raw, "deadbeef");
    expect(result).toEqual({ accepted: false, reason: "signature_invalid" });

    const rows = (await db.execute(sql`
      select signature_verified from webhook_events where raw_body = ${raw}
    `)) as unknown as { signature_verified: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].signature_verified).toBe(false);
    await db.execute(sql`delete from webhook_events where raw_body = ${raw}`);
  });

  it("will not settle a payment that names a different gateway order", async () => {
    // notes are client-supplied at Razorpay's checkout, so a signed webhook could name any order
    // and take its whole reserved amount. The gateway order id is ours, and it is the real binding.
    const { raw, signature } = signed(
      capturedEvent(orderId, `pay_EVIL${stamp}`, { order_id: `order_SOMEONE_ELSE${stamp}` }),
    );
    const result = await handleWebhook(raw, signature);
    expect(result.reason).toBe("mismatched");

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order.state).toBe("AWAITING_AUTHORIZATION");
    expect((await ledger.balances(authId, MAX)).debitedPaise).toBe(0n);
  });

  it("will not settle a capture for the wrong amount", async () => {
    const { raw, signature } = signed(
      capturedEvent(orderId, `pay_CHEAP${stamp}`, { amount: 1 }),
    );
    expect((await handleWebhook(raw, signature)).reason).toBe("mismatched");
    expect((await ledger.balances(authId, MAX)).debitedPaise).toBe(0n);
  });

  // Twenty-odd round trips to a hosted Postgres, twice over. Vitest's 5s default was a coin flip on
  // a slow link, and a timing-out webhook test looks like a settlement bug that is not there.
  it("settles the order and debits exactly once across two deliveries", { timeout: 30_000 }, async () => {
    const { raw, signature } = signed(capturedEvent(orderId, `pay_WH${stamp}`));

    const first = await handleWebhook(raw, signature);
    const second = await handleWebhook(raw, signature);

    expect(first.reason).toBe("processed");
    expect(second.reason).toBe("replayed");

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order.state).toBe("PAID");
    expect(order.razorpayPaymentId).toBe(`pay_WH${stamp}`);

    const balances = await ledger.balances(authId, MAX);
    expect(balances.debitedPaise).toBe(AMOUNT);
    expect(balances.heldPaise).toBe(0n);
    expect(balances.availablePaise).toBe(MAX - AMOUNT);

    const commits = (await db.execute(sql`
      select count(*)::text as n from authorization_ledger
      where reservation_id = ${orderId} and entry_type = 'COMMIT'
    `)) as unknown as { n: string }[];
    expect(commits[0].n).toBe("1");
  });

  it("does not reopen a settled order when a failure arrives late", async () => {
    const { raw, signature } = signed({
      event: "payment.failed",
      payload: { payment: { entity: { id: `pay_LATE${stamp}`, order_id: `order_WH${stamp}`,
        notes: { vouch_order_id: orderId }, error_description: "late" } } },
    });

    await handleWebhook(raw, signature);

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order.state).toBe("PAID");

    const balances = await ledger.balances(authId, MAX);
    expect(balances.debitedPaise).toBe(AMOUNT);
  });
});
