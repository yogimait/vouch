// A person refusing an escalation.
//
// The interesting property is what it does NOT do: an escalation holds nothing, so declining one
// must move no money at all. The FAILED-plus-reason shape is what keeps a refusal distinguishable
// from the deadline passing, which is the whole reason this exists.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("declining an escalation", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let ledger: typeof import("@/core/ledger");
  let declineOrder: typeof import("@/core/orders/decline").declineOrder;

  const MAX = 1000_00n;
  const AMOUNT = 800_00n;
  const stamp = Date.now();
  const authId = `auth_DC${stamp}`;
  const escalatedId = `ord_DCE${stamp}`;
  const admittedId = `ord_DCA${stamp}`;

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    ledger = await import("@/core/ledger");
    declineOrder = (await import("@/core/orders/decline")).declineOrder;

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
      sku: item.sku, qty: 1, unitPricePaise: AMOUNT, totalPaise: AMOUNT,
      nonce: `nonce_DC${tag}${stamp}`, token: `token_DC${tag}${stamp}`,
      expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.offers).values([offer(`off_DCE${stamp}`, "E"), offer(`off_DCA${stamp}`, "A")]);

    const later = new Date(Date.now() + 600_000);
    await db.insert(schema.orders).values([
      { id: escalatedId, agentId: agent.id, authorizationId: authId, offerId: `off_DCE${stamp}`,
        idempotencyKey: `idem_DCE${stamp}`, amountPaise: AMOUNT, state: "ESCALATED", expiresAt: later },
      { id: admittedId, agentId: agent.id, authorizationId: authId, offerId: `off_DCA${stamp}`,
        idempotencyKey: `idem_DCA${stamp}`, amountPaise: AMOUNT,
        state: "AWAITING_AUTHORIZATION", expiresAt: later },
    ]);
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where order_id in (${escalatedId}, ${admittedId})`);
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.execute(sql`delete from orders where id in (${escalatedId}, ${admittedId})`);
    await db.execute(sql`delete from offers where id in (${`off_DCE${stamp}`}, ${`off_DCA${stamp}`})`);
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("closes the order and moves no money", async () => {
    const result = await declineOrder(escalatedId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // An escalation never reserved, so there is nothing to give back.
    expect(result.releasedPaise).toBe("0");

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, escalatedId));
    expect(order.state).toBe("FAILED");
    // The reason is the whole point: this is what a deadline passing does not write.
    expect(order.failureReason).toBe("declined by the approver");

    const after = await ledger.balances(authId, MAX);
    expect(after.debitedPaise).toBe(0n);
    expect(after.heldPaise).toBe(0n);
  });

  it("refuses anything that was not waiting on a person", async () => {
    const admitted = await declineOrder(admittedId);
    expect(admitted.ok).toBe(false);
    if (admitted.ok) return;
    expect(admitted.code).toBe("ORDER_NOT_ESCALATED");

    // And it stays refused once already closed, rather than closing twice.
    const again = await declineOrder(escalatedId);
    expect(again.ok).toBe(false);

    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, admittedId));
    expect(order.state).toBe("AWAITING_AUTHORIZATION");
  });

  it("refuses an order that does not exist", async () => {
    const missing = await declineOrder("ord_DOES_NOT_EXIST");
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.code).toBe("ORDER_UNKNOWN");
  });
}, 30_000);
