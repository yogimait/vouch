// The cupboard fills when the money moves, never when the guard admits.
//
// This is the same rule our own warehouse already keeps — drawDownStock runs at settlement, not at
// admission — and it has to hold on both sides, or the demo shows goods arriving for orders nobody
// paid for.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("delivering to the cupboard", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let opsTick: typeof import("@/demo/ops").opsTick;

  const stamp = Date.now();
  const shelfId = `cup_DL${stamp}`;
  const offerId = `off_DL${stamp}`;
  const orderId = `ord_DL${stamp}`;
  const requestId = `req_DL${stamp}`;
  const receiptId = `rcp_DL${stamp}`;
  const QTY = 3;

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    opsTick = (await import("@/demo/ops")).opsTick;

    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const [agent] = await db.select().from(schema.buyerAgents).limit(1);
    const [auth] = await db.select().from(schema.authorizations).limit(1);
    const [item] = await db.select().from(schema.catalogItems).limit(1);
    if (!merchant || !agent || !auth || !item) throw new Error("Run `npm run db:seed` first.");

    // usage 0, so ticking cannot drain this shelf and change the number under the assertion.
    await db.insert(schema.cupboardItems).values({
      id: shelfId, name: `Test widgets ${stamp}`, onHand: 5, startOnHand: 8,
      reorderLevel: 5, usagePerTick: 0, need: "A test shelf.",
    });
    await db.insert(schema.offers).values({
      id: offerId, merchantId: merchant.id, agentId: agent.id, authorizationId: auth.id,
      sku: item.sku, qty: QTY, unitPricePaise: 100_00n, totalPaise: 300_00n,
      nonce: `nonce_DL${stamp}`, token: `token_DL${stamp}`,
      expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.orders).values({
      id: orderId, agentId: agent.id, authorizationId: auth.id, offerId,
      idempotencyKey: `idem_DL${stamp}`, amountPaise: 300_00n,
      state: "AWAITING_AUTHORIZATION", expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.purchaseRequests).values({
      id: requestId, source: "REORDER", cupboardItemId: shelfId, raisedBy: "test",
      need: "A test shelf.", status: "CLOSED", outcome: "ADMIT", orderId,
      closedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from receipts where id = ${receiptId}`);
    await db.execute(sql`delete from purchase_requests where id = ${requestId}`);
    await db.execute(sql`delete from orders where id = ${orderId}`);
    await db.execute(sql`delete from offers where id = ${offerId}`);
    await db.execute(sql`delete from cupboard_items where id = ${shelfId}`);
  });

  async function onHand(): Promise<number> {
    const [row] = await db.select().from(schema.cupboardItems).where(eq(schema.cupboardItems.id, shelfId));
    return row.onHand;
  }

  it("delivers nothing while the order is only admitted", async () => {
    await opsTick();
    expect(await onHand()).toBe(5);

    const [row] = await db.select().from(schema.purchaseRequests)
      .where(eq(schema.purchaseRequests.id, requestId));
    expect(row.deliveredAt).toBeNull();
  });

  it("delivers nothing when the order is PAID but no receipt exists", async () => {
    await db.update(schema.orders).set({ state: "PAID" }).where(eq(schema.orders.id, orderId));
    await opsTick();
    expect(await onHand()).toBe(5);
  });

  it("puts exactly what was bought on the shelf once the receipt is signed", async () => {
    await db.insert(schema.receipts).values({
      id: receiptId, orderId, body: "{}", signature: "test", keyId: "test",
      blockHashes: {}, bodyHash: "test",
    });

    await opsTick();
    expect(await onHand()).toBe(5 + QTY);

    const [row] = await db.select().from(schema.purchaseRequests)
      .where(eq(schema.purchaseRequests.id, requestId));
    expect(row.deliveredAt).not.toBeNull();
  });

  it("does not deliver the same order twice", async () => {
    await opsTick();
    await opsTick();
    expect(await onHand()).toBe(5 + QTY);
  });
}, 30_000);
