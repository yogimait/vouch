// A hold that nobody paid must come back. The ledger has always written a deadline and nothing ever
// read it, so these assert the reader — against the ledger directly, not through a browser.
//
// No order here carries a razorpay_order_id, deliberately: that path asks the live gateway, and a
// test suite that reaches Razorpay is measuring Razorpay. The sweep also runs against a fixed 2020
// clock so it can only ever see these rows -- real orders in the database are years newer, and
// letting the suite sweep them would both reach the gateway and destroy someone's demo state.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("expiring a stale hold", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let ledger: typeof import("@/core/ledger");
  let expireStaleOrders: typeof import("@/core/orders/expire").expireStaleOrders;

  const MAX = 1000_00n;
  const HELD = 400_00n;
  const stamp = Date.now();
  const authId = `auth_XP${stamp}`;
  // Two offers, because orders_offer_unique allows exactly one order per offer.
  const heldOfferId = `off_XPH${stamp}`;
  const escalatedOfferId = `off_XPE${stamp}`;
  // One order holds money, one is an escalation that never reserved. Both are past their deadline.
  const heldId = `ord_XPH${stamp}`;
  const escalatedId = `ord_XPE${stamp}`;
  const past = new Date("2020-01-01T00:00:00.000Z");
  const cutoff = new Date("2020-06-01T00:00:00.000Z");

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    ledger = await import("@/core/ledger");
    expireStaleOrders = (await import("@/core/orders/expire")).expireStaleOrders;

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
    const offer = (id: string, tag: string) => ({
      id, merchantId: merchant.id, agentId: agent.id, authorizationId: authId,
      sku: item.sku, qty: 1, unitPricePaise: HELD, totalPaise: HELD,
      nonce: `nonce_XP${tag}${stamp}`, token: `token_XP${tag}${stamp}`,
      expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.offers).values([
      offer(heldOfferId, "H"), offer(escalatedOfferId, "E"),
    ]);
    await db.insert(schema.orders).values([
      { id: heldId, agentId: agent.id, authorizationId: authId, offerId: heldOfferId,
        idempotencyKey: `idem_XPH${stamp}`, amountPaise: HELD,
        state: "AWAITING_AUTHORIZATION", expiresAt: past },
      { id: escalatedId, agentId: agent.id, authorizationId: authId, offerId: escalatedOfferId,
        idempotencyKey: `idem_XPE${stamp}`, amountPaise: HELD,
        state: "ESCALATED", expiresAt: past },
    ]);

    await ledger.reserve({
      authorizationId: authId, orderId: heldId, reservationId: heldId,
      amountPaise: HELD, maxAmountPaise: MAX, expiresAt: past,
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where order_id in (${heldId}, ${escalatedId})`);
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.execute(sql`delete from orders where id in (${heldId}, ${escalatedId})`);
    await db.execute(sql`delete from offers where id in (${heldOfferId}, ${escalatedOfferId})`);
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("gives the hold back and marks the order expired", async () => {
    const before = await ledger.balances(authId, MAX);
    expect(before.heldPaise).toBe(HELD);
    expect(before.availablePaise).toBe(MAX - HELD);

    const sweep = await expireStaleOrders(cutoff);
    expect(sweep.expired).toBe(2);
    expect(sweep.releasedPaise).toBe(HELD);

    const after = await ledger.balances(authId, MAX);
    expect(after.heldPaise).toBe(0n);
    // A hold coming back is not a refund. Nothing was ever debited here.
    expect(after.debitedPaise).toBe(0n);
    expect(after.availablePaise).toBe(MAX);

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, heldId));
    expect(order.state).toBe("EXPIRED");
  });

  it("expires an escalation without moving any money", async () => {
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, escalatedId));
    expect(order.state).toBe("EXPIRED");

    // An ESCALATE never reserves, so there is nothing to give back and no ledger row to write.
    const rows = (await db.execute(sql`
      select count(*)::text as n from authorization_ledger where reservation_id = ${escalatedId}
    `)) as unknown as { n: string }[];
    expect(rows[0].n).toBe("0");
  });

  it("does not release twice when the sweeper runs again", async () => {
    const again = await expireStaleOrders(cutoff);
    expect(again.expired).toBe(0);

    const rows = (await db.execute(sql`
      select count(*)::text as n from authorization_ledger
      where reservation_id = ${heldId} and entry_type = 'RELEASE'
    `)) as unknown as { n: string }[];
    expect(rows[0].n).toBe("1");

    const after = await ledger.balances(authId, MAX);
    expect(after.availablePaise).toBe(MAX);
  });

  it("writes one audit row per order it expired", async () => {
    const rows = (await db.execute(sql`
      select order_id, count(*)::text as n from audit_log
       where event_type = 'ORDER_EXPIRED' and order_id in (${heldId}, ${escalatedId})
       group by order_id
    `)) as unknown as { order_id: string; n: string }[];
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.n).toBe("1");
  });
}, 30_000);
