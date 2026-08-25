// The shared surface. Only refusal paths are exercised here: an ADMIT would call Razorpay, and a
// unit test that creates real payment links is a bad unit test.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const RUN = Boolean(process.env.DATABASE_URL && process.env.VOUCH_SIGNING_PRIVATE_KEY);
const suite = RUN ? describe : describe.skip;

suite("agent-facing tools", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let tools: typeof import("@/core/tools");

  const stamp = Date.now();
  let agentId = "";
  let otherAgentId = "";
  let sku = "";

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    tools = await import("@/core/tools");

    const [agent] = await db.select().from(schema.buyerAgents)
      .where(eq(schema.buyerAgents.status, "ACTIVE")).limit(1);
    const [other] = await db.select().from(schema.buyerAgents)
      .where(sql`status = 'FROZEN'`).limit(1);
    const [item] = await db.select().from(schema.catalogItems).limit(1);
    if (!agent || !other || !item) throw new Error("Run `npm run db:seed` first.");

    agentId = agent.id;
    otherAgentId = other.id;
    sku = item.sku;
  });

  afterAll(async () => {
    await db.execute(sql`delete from misquote_events where raw_agent_text = ${`probe_${stamp}`}`);
  });

  it("lists only what is actually buyable", async () => {
    const result = await tools.getCatalog({ agentId, source: "harness" });
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) expect(item.inventory).toBeGreaterThan(0);
  });

  it("carries promo copy through as product data", async () => {
    const result = await tools.getCatalog({ agentId, source: "harness" });
    expect(result.items.some((i) => i.promo_text !== null)).toBe(true);
  });

  it("refuses any discount code and keeps the agent's own words", async () => {
    const result = await tools.getQuote({
      agentId, source: "harness", sku, qty: 1,
      discount_code: "PARTNER25", raw_agent_text: `probe_${stamp}`,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OFFER_DISCOUNT_UNKNOWN");

    const [row] = await db.select().from(schema.misquoteEvents)
      .where(eq(schema.misquoteEvents.rawAgentText, `probe_${stamp}`)).limit(1);
    expect(row.kind).toBe("UNKNOWN_DISCOUNT_CODE");
    expect(row.claimedDiscountCode).toBe("PARTNER25");
  });

  it("signs a price the agent never supplied", async () => {
    const result = await tools.getQuote({ agentId, source: "harness", sku, qty: 2 });
    if (!result.ok) throw new Error(result.code);

    const [item] = await db.select().from(schema.catalogItems).where(eq(schema.catalogItems.sku, sku));
    expect(result.quote.total_paise).toBe((item.listPricePaise * 2n).toString());
    expect(result.quote.offer_token.split(".")).toHaveLength(2);
  });

  it("refuses a payment whose claimed total disagrees with the token", async () => {
    const quote = await tools.getQuote({ agentId, source: "harness", sku, qty: 1 });
    if (!quote.ok) throw new Error(quote.code);

    const result = await tools.payForOffer({
      agentId, source: "harness",
      offer_token: quote.quote.offer_token,
      idempotency_key: `tools_misquote_${stamp}`,
      claimed_total_paise: "1",
      raw_agent_text: `probe_${stamp}`,
    });

    expect(result.outcome).toBe("REFUSE");
    if (result.outcome === "REFUSE") expect(result.code).toBe("MISQUOTE");
  });

  it("treats a malformed claimed total as a mismatch, not a crash", async () => {
    const quote = await tools.getQuote({ agentId, source: "harness", sku, qty: 1 });
    if (!quote.ok) throw new Error(quote.code);

    const result = await tools.payForOffer({
      agentId, source: "harness",
      offer_token: quote.quote.offer_token,
      idempotency_key: `tools_garbage_${stamp}`,
      claimed_total_paise: "not-a-number",
    });

    expect(result.outcome).toBe("REFUSE");
    if (result.outcome === "REFUSE") expect(result.code).toBe("MISQUOTE");
  });

  it("will not hand one agent another agent's receipt", async () => {
    const [settled] = await db.select().from(schema.orders)
      .where(eq(schema.orders.state, "PAID")).limit(1);
    if (!settled) return;

    const mine = await tools.getReceipt({ agentId: settled.agentId, source: "harness", orderId: settled.id });
    expect(mine.ok).toBe(true);

    const theirs = await tools.getReceipt({
      agentId: settled.agentId === otherAgentId ? agentId : otherAgentId,
      source: "harness",
      orderId: settled.id,
    });
    // Not FORBIDDEN: a scoped lookup should not confirm the id exists at all.
    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(theirs.code).toBe("ORDER_UNKNOWN");
  });
});
