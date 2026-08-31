// What a replayed idempotency key is allowed to return.
//
// Both branches here run before any verification, so no signed token is needed: pay() looks the key
// up first, and that is exactly where both bugs lived.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("replaying an idempotency key", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let pay: typeof import("@/core/orders/pay").pay;

  const MAX = 1000_00n;
  const AMOUNT = 300_00n;
  const stamp = Date.now();
  const authId = `auth_ID${stamp}`;
  const offerId = `off_ID${stamp}`;
  const orderId = `ord_ID${stamp}`;
  const token = `token_ID${stamp}`;
  const key = `idem_ID${stamp}`;
  let agentId: string;

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    pay = (await import("@/core/orders/pay")).pay;

    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const [agent] = await db.select().from(schema.buyerAgents).limit(1);
    const [item] = await db.select().from(schema.catalogItems).limit(1);
    if (!merchant || !agent || !item) throw new Error("Run `npm run db:seed` first.");
    agentId = agent.id;

    await db.insert(schema.authorizations).values({
      id: authId, agentId, merchantId: merchant.id,
      maxAmountPaise: MAX, maxPerOrderPaise: MAX,
      expireAt: new Date(Date.now() + 86_400_000),
      grantedBy: "test", grantedVia: "test", grantSignature: "test",
    });
    await db.insert(schema.offers).values({
      id: offerId, merchantId: merchant.id, agentId, authorizationId: authId,
      sku: item.sku, qty: 1, unitPricePaise: AMOUNT, totalPaise: AMOUNT,
      nonce: `nonce_ID${stamp}`, token, expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.orders).values({
      id: orderId, agentId, authorizationId: authId, offerId,
      idempotencyKey: key, amountPaise: AMOUNT, state: "AWAITING_AUTHORIZATION",
      authorizationUrl: "https://example.test/pay/one",
      expiresAt: new Date(Date.now() + 600_000),
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from decisions where agent_id = ${agentId} and authorization_id is null`);
    await db.execute(sql`delete from audit_log where order_id = ${orderId}`);
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.delete(schema.orders).where(eq(schema.orders.id, orderId));
    await db.delete(schema.offers).where(eq(schema.offers.id, offerId));
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("returns the same order when the key is replayed with the same offer", async () => {
    const again = await pay({ agentId, offerToken: token, idempotencyKey: key, source: "harness" });
    expect(again.outcome).toBe("ADMIT");
    if (again.outcome !== "ADMIT") return;
    expect(again.orderId).toBe(orderId);
    expect(again.replayed).toBe(true);
  });

  it("refuses the key when it is reused for different terms", async () => {
    // This used to answer 201 describing the FIRST order, so an agent that quoted something else
    // and reused a key was told it had bought it.
    const other = await pay({
      agentId, offerToken: `${token}_BUT_FOR_SOMETHING_ELSE`, idempotencyKey: key, source: "harness",
    });
    expect(other.outcome).toBe("REFUSE");
    if (other.outcome !== "REFUSE") return;
    expect(other.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("refuses to resume an order that expired", async () => {
    await db.update(schema.orders).set({ state: "EXPIRED" }).where(eq(schema.orders.id, orderId));

    const dead = await pay({ agentId, offerToken: token, idempotencyKey: key, source: "harness" });
    expect(dead.outcome).toBe("REFUSE");
    if (dead.outcome !== "REFUSE") return;
    // It used to fall through to ADMIT and hand back the authorization_url of an order that nothing
    // could settle -- a replay reporting success for money that never moved.
    expect(dead.code).toBe("ORDER_EXPIRED");
  });
}, 30_000);
