// A gateway outage must not eat the agent's headroom. Uses a real 401 from Razorpay rather than a
// mocked fetch — a mock would prove the test's idea of failure, not Razorpay's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

// Set before @/core/env is imported anywhere: env() caches its first successful parse.
process.env.RAZORPAY_KEY_SECRET = "deliberately_wrong_secret";

const RUN = Boolean(process.env.DATABASE_URL && process.env.RAZORPAY_KEY_ID);
const suite = RUN ? describe : describe.skip;

suite("gateway failure", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let ledger: typeof import("@/core/ledger");
  let issueOffer: typeof import("@/core/offers/issue").issueOffer;
  let pay: typeof import("@/core/orders/pay").pay;

  const MAX = 1000_00n;
  const stamp = Date.now();
  const authId = `auth_GW${stamp}`;
  let agentId = "";
  let sku = "";

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    ledger = await import("@/core/ledger");
    issueOffer = (await import("@/core/offers/issue")).issueOffer;
    pay = (await import("@/core/orders/pay")).pay;

    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const [agent] = await db.select().from(schema.buyerAgents).limit(1);
    const [item] = await db.select().from(schema.catalogItems)
      .where(sql`list_price_paise <= ${MAX.toString()} and inventory > 0`).limit(1);
    if (!merchant || !agent || !item) throw new Error("Run `npm run db:seed` first.");

    agentId = agent.id;
    sku = item.sku;
    await db.insert(schema.authorizations).values({
      id: authId, agentId: agent.id, merchantId: merchant.id,
      maxAmountPaise: MAX, maxPerOrderPaise: MAX,
      // Velocity is counted per AGENT, not per authorization, so the default cap of 10 made this
      // test fail the moment the seeded agent had a busy hour -- it refused VELOCITY_EXCEEDED before
      // ever reaching the gateway. This test is about the gateway; the cap is not its variable.
      maxOrdersPerHour: 1000,
      allowedCategories: [item.category],
      expireAt: new Date(Date.now() + 86_400_000),
      grantedBy: "test", grantedVia: "test", grantSignature: "test",
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where order_id in (select id from orders where authorization_id = ${authId})`);
    await db.execute(sql`delete from decisions where authorization_id = ${authId}`);
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.execute(sql`delete from orders where authorization_id = ${authId}`);
    await db.execute(sql`delete from offers where authorization_id = ${authId}`);
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("gives the hold back when the gateway rejects us", async () => {
    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const issued = await issueOffer({ merchantId: merchant.id, agentId, authorizationId: authId, sku, qty: 1 });
    if (!issued.ok) throw new Error(`quote failed: ${issued.code}`);

    const before = await ledger.balances(authId, MAX);
    const result = await pay({
      agentId, offerToken: issued.offer.token,
      idempotencyKey: `gw_${stamp}`, source: "harness", label: "gateway-failure",
    });

    expect(result.outcome).toBe("REFUSE");
    if (result.outcome === "REFUSE") expect(result.code).toBe("GATEWAY_UNAVAILABLE");

    // The decision was ADMIT; only the settlement failed. Gate and settlement stay separate.
    const [decision] = await db.select().from(schema.decisions)
      .where(eq(schema.decisions.authorizationId, authId)).limit(1);
    expect(decision.outcome).toBe("ADMIT");

    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.authorizationId, authId)).limit(1);
    expect(order.state).toBe("FAILED");

    const after = await ledger.balances(authId, MAX);
    expect(after.heldPaise).toBe(before.heldPaise);
    expect(after.availablePaise).toBe(before.availablePaise);
  }, 30_000);
});
