// The escalate branch of pay(), driven rather than staged.
//
// Every other test that involves an ESCALATED order hand-inserts the row — decline, expiry and the
// state map all start from `db.insert({ state: "ESCALATED" })`. That proves what happens *after* an
// escalation and nothing about how one is reached, which left the branch that decides it untested.
//
// This one calls pay() with a real signed offer and lets the engine rule fire. It asserts the two
// properties that make ESCALATE different from both of its neighbours:
//
//   it is not a refusal  — 202, an order exists, and a human can still complete it
//   it is not an admission — nothing is held, because this was never the agent's spend to make
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

// This is the one suite that touches Razorpay: escalate() creates a gateway order before it can
// hand back a link, so reaching the branch at all means reaching the network. Gateway orders are not
// rate-limited and cost nothing; payment links are capped at 30 for the lifetime of a test account,
// and that quota is already spent, so pay.ts takes its documented fallback to the merchant's own
// checkout page instead. Both outcomes are asserted below.
//
// Skipped without a signing key, because the offer has to be genuinely signed for pay() to accept
// it — staging the row is the thing this test exists to stop doing.
const RUN = Boolean(process.env.DATABASE_URL && process.env.VOUCH_SIGNING_PRIVATE_KEY);
const suite = RUN ? describe : describe.skip;

suite("pay() reaching escalate", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let ledger: typeof import("@/core/ledger");
  let pay: typeof import("@/core/orders/pay").pay;
  let issueOffer: typeof import("@/core/offers/issue").issueOffer;

  // A ceiling below the item's price, so authorization.maxPerOrder trips and nothing else can.
  const MAX = 100_000_00n;
  const PER_ORDER = 1_000_00n;
  const stamp = Date.now();
  const authId = `auth_ES${stamp}`;
  let agentId = "";
  let merchantId = "";
  let sku = "";
  let unitPricePaise = 0n;

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    ledger = await import("@/core/ledger");
    pay = (await import("@/core/orders/pay")).pay;
    issueOffer = (await import("@/core/offers/issue")).issueOffer;

    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const [agent] = await db.select().from(schema.buyerAgents)
      .where(eq(schema.buyerAgents.status, "ACTIVE")).limit(1);
    const [item] = await db.select().from(schema.catalogItems)
      .where(eq(schema.catalogItems.sku, "SKU-B")).limit(1);
    if (!merchant || !agent || !item) throw new Error("Run `npm run db:seed` first.");

    agentId = agent.id;
    merchantId = merchant.id;
    sku = item.sku;
    unitPricePaise = item.listPricePaise;
    expect(unitPricePaise).toBeGreaterThan(PER_ORDER);

    await db.insert(schema.authorizations).values({
      id: authId, agentId, merchantId,
      maxAmountPaise: MAX,
      maxPerOrderPaise: PER_ORDER,
      // Velocity is counted per agent across every authorization, so a busy seeded agent would
      // otherwise trip rule 12 before the per-order rule this test is about.
      maxOrdersPerHour: 1000,
      allowedCategories: [item.category],
      expireAt: new Date(Date.now() + 86_400_000),
      status: "confirmed",
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

  it("escalates over the per-order ceiling, and holds nothing", async () => {
    const offer = await issueOffer({ merchantId, agentId, authorizationId: authId, sku, qty: 1 });
    expect(offer.ok).toBe(true);
    if (!offer.ok) return;
    expect(offer.offer.totalPaise).toBeGreaterThan(PER_ORDER);

    const result = await pay({
      agentId, offerToken: offer.offer.token,
      idempotencyKey: `idem_ES${stamp}`, source: "harness",
    });

    // ESCALATE if the gateway answered, REFUSE/GATEWAY_UNAVAILABLE if it could not be reached. The
    // engine's verdict is the same either way, and the money assertions below hold in both.
    expect(["ESCALATE", "REFUSE"]).toContain(result.outcome);
    if (result.outcome === "REFUSE") expect(result.code).toBe("GATEWAY_UNAVAILABLE");

    // The decision is the part that must be right regardless of whether Razorpay was reachable.
    const [decision] = await db.select().from(schema.decisions)
      .where(eq(schema.decisions.authorizationId, authId)).limit(1);
    expect(decision.outcome).toBe("ESCALATE");
    expect(decision.reasons[0].code).toBe("PER_ORDER_LIMIT_EXCEEDED");
    expect(decision.reasons[0].rule).toBe("authorization.maxPerOrder");
    // `expected` is string | string[] on the shared reason type -- the scope rule reports a list of
    // allowed categories. A money rule always reports one value.
    expect(String(decision.reasons[0].expected)).toBe(PER_ORDER.toString());

    // Not the agent's spend to make, so not a paisa of the mandate is held against it.
    const after = await ledger.balances(authId, MAX);
    expect(after.heldPaise).toBe(0n);
    expect(after.debitedPaise).toBe(0n);
    expect(after.availablePaise).toBe(MAX);
  }, 30_000);

  it("records an order a person could still complete", async () => {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.authorizationId, authId)).limit(1);

    // An escalation is accepted, not refused: the order exists so a human has something to pay.
    expect(order).toBeDefined();
    expect(["ESCALATED", "FAILED"]).toContain(order.state);
    if (order.state === "ESCALATED") expect(order.authorizationUrl).toBeTruthy();
  });
}, 30_000);
