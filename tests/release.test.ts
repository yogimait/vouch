// A failed payment must give the hold back. Tested against the ledger directly rather than through
// a browser: the browser proves the demo, this proves the property, and only one of those belongs
// in a test suite.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("release on failure", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let ledger: typeof import("@/core/ledger");
  let failOrder: typeof import("@/core/orders/settle").failOrder;

  const MAX = 1000_00n;
  const AMOUNT = 400_00n;
  const stamp = Date.now();
  const authId = `auth_RL${stamp}`;
  const offerId = `off_RL${stamp}`;
  const orderId = `ord_RL${stamp}`;

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    ledger = await import("@/core/ledger");
    failOrder = (await import("@/core/orders/settle")).failOrder;

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
      nonce: `nonce_RL${stamp}`, token: `token_RL${stamp}`,
      expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.orders).values({
      id: orderId, agentId: agent.id, authorizationId: authId, offerId,
      idempotencyKey: `idem_RL${stamp}`, amountPaise: AMOUNT, state: "AWAITING_AUTHORIZATION",
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where order_id = ${orderId}`);
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.delete(schema.orders).where(eq(schema.orders.id, orderId));
    await db.delete(schema.offers).where(eq(schema.offers.id, offerId));
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("returns the exact hold and leaves nothing debited", async () => {
    await ledger.reserve({
      authorizationId: authId, orderId, reservationId: orderId,
      amountPaise: AMOUNT, maxAmountPaise: MAX, expiresAt: new Date(Date.now() + 600_000),
    });
    const held = await ledger.balances(authId, MAX);
    expect(held.heldPaise).toBe(AMOUNT);
    expect(held.availablePaise).toBe(MAX - AMOUNT);

    const failed = await failOrder(orderId, "card declined", { source: "polled" });
    expect(failed.changed).toBe(true);
    expect(failed.releasedPaise).toBe(AMOUNT);

    const after = await ledger.balances(authId, MAX);
    expect(after.heldPaise).toBe(0n);
    expect(after.debitedPaise).toBe(0n);
    expect(after.availablePaise).toBe(MAX);

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order.state).toBe("FAILED");
  });

  it("does not release twice when the same failure arrives again", async () => {
    const again = await failOrder(orderId, "card declined", { source: "webhook" });
    expect(again.changed).toBe(false);

    const rows = (await db.execute(sql`
      select count(*)::text as n from authorization_ledger
      where reservation_id = ${orderId} and entry_type = 'RELEASE'
    `)) as unknown as { n: string }[];
    expect(rows[0].n).toBe("1");

    const after = await ledger.balances(authId, MAX);
    expect(after.availablePaise).toBe(MAX);
  });
});
