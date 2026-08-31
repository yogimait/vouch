// Stock leaves when the money is taken. Tested against the table directly rather than through a
// browser walk: the walk proves the demo, this proves the property. The second test is the one that
// matters — a webhook and a poll can both report the same capture, and a decrement that ran twice
// would quietly sell inventory nobody bought.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("inventory draws down on settlement", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let ledger: typeof import("@/core/ledger");
  let settleOrder: typeof import("@/core/orders/settle").settleOrder;

  const MAX = 1000_00n;
  const AMOUNT = 400_00n;
  const QTY = 3;
  const stamp = Date.now();
  const authId = `auth_IV${stamp}`;
  const offerId = `off_IV${stamp}`;
  const orderId = `ord_IV${stamp}`;

  let sku: string;
  let startingInventory: number;

  async function inventoryNow(): Promise<number> {
    const [row] = await db.select().from(schema.catalogItems).where(eq(schema.catalogItems.sku, sku));
    return row.inventory;
  }

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    ledger = await import("@/core/ledger");
    settleOrder = (await import("@/core/orders/settle")).settleOrder;

    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const [agent] = await db.select().from(schema.buyerAgents).limit(1);
    // Deepest shelf, so QTY cannot hit the floor and hide a bad decrement behind greatest(_, 0).
    const [item] = await db.select().from(schema.catalogItems)
      .orderBy(desc(schema.catalogItems.inventory)).limit(1);
    if (!merchant || !agent || !item) throw new Error("Run `npm run db:seed` first.");

    sku = item.sku;
    startingInventory = item.inventory;

    await db.insert(schema.authorizations).values({
      id: authId, agentId: agent.id, merchantId: merchant.id,
      maxAmountPaise: MAX, maxPerOrderPaise: MAX,
      expireAt: new Date(Date.now() + 86_400_000),
      grantedBy: "test", grantedVia: "test", grantSignature: "test",
    });
    await db.insert(schema.offers).values({
      id: offerId, merchantId: merchant.id, agentId: agent.id, authorizationId: authId,
      sku, qty: QTY, unitPricePaise: AMOUNT / BigInt(QTY), totalPaise: AMOUNT,
      nonce: `nonce_IV${stamp}`, token: `token_IV${stamp}`,
      expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.orders).values({
      id: orderId, agentId: agent.id, authorizationId: authId, offerId,
      idempotencyKey: `idem_IV${stamp}`, amountPaise: AMOUNT, state: "AWAITING_AUTHORIZATION",
    });
  });

  afterAll(async () => {
    await db.update(schema.catalogItems)
      .set({ inventory: startingInventory }).where(eq(schema.catalogItems.sku, sku));
    await db.execute(sql`delete from receipts where order_id = ${orderId}`);
    await db.execute(sql`delete from audit_log where order_id = ${orderId}`);
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.delete(schema.orders).where(eq(schema.orders.id, orderId));
    await db.delete(schema.offers).where(eq(schema.offers.id, offerId));
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("removes exactly the quantity that was bought", async () => {
    await ledger.reserve({
      authorizationId: authId, orderId, reservationId: orderId,
      amountPaise: AMOUNT, maxAmountPaise: MAX, expiresAt: new Date(Date.now() + 600_000),
    });

    const settled = await settleOrder(orderId, `pay_IV${stamp}`, { source: "polled" });
    expect(settled.changed).toBe(true);
    expect(await inventoryNow()).toBe(startingInventory - QTY);
    // Settling is a transition, a commit, a stock draw-down, an audit write and a signed receipt.
    // Against a hosted database that is comfortably past the 5s default, as it proved to be.
  }, 30_000);

  it("does not draw down twice when the same capture arrives again", async () => {
    const again = await settleOrder(orderId, `pay_IV${stamp}`, { source: "webhook" });
    expect(again.changed).toBe(false);
    expect(await inventoryNow()).toBe(startingInventory - QTY);
  });
});
