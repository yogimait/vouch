// The reservation race is the whole point of the ledger, and it cannot be tested without a real
// Postgres: two transactions have to actually contend for the advisory lock.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent locally is fine — the suite below gates on DATABASE_URL and skips.
}

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("authorization ledger", () => {
  let db: Awaited<typeof import("@/core/db")> extends never ? never : ReturnType<typeof import("@/core/db").getDb>;
  let ledger: typeof import("@/core/ledger");
  let schema: typeof import("@/core/db/schema");
  let authId: string;

  const MAX = 1000_00n; // Rs 1,000.00

  beforeAll(async () => {
    const dbModule = await import("@/core/db");
    ledger = await import("@/core/ledger");
    schema = await import("@/core/db/schema");
    db = dbModule.getDb();

    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const [agent] = await db.select().from(schema.buyerAgents).limit(1);
    if (!merchant || !agent) throw new Error("Run `npm run db:seed` before the ledger test.");

    authId = `auth_TEST${Date.now()}`;
    await db.insert(schema.authorizations).values({
      id: authId,
      agentId: agent.id,
      merchantId: merchant.id,
      maxAmountPaise: MAX,
      maxPerOrderPaise: MAX,
      expireAt: new Date(Date.now() + 86_400_000),
      grantedBy: "test",
      grantedVia: "test",
      grantSignature: "test",
    });
  });

  afterAll(async () => {
    if (!authId) return;
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("derives balances from entries, not a column", async () => {
    const before = await ledger.balances(authId, MAX);
    expect(before).toEqual({ debitedPaise: 0n, heldPaise: 0n, availablePaise: MAX });
  });

  it("lets exactly one of two concurrent overdrawing reservations through", async () => {
    // Rs 600 each against Rs 1,000: together they overdraw, so exactly one must win.
    const attempt = (n: number) => ledger.reserve({
      authorizationId: authId,
      orderId: `ord_RACE${n}`,
      reservationId: `ord_RACE${n}_${Date.now()}`,
      amountPaise: 600_00n,
      maxAmountPaise: MAX,
      expiresAt: new Date(Date.now() + 600_000),
    });

    const [a, b] = await Promise.all([attempt(1), attempt(2)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);

    const after = await ledger.balances(authId, MAX);
    expect(after.heldPaise).toBe(600_00n);
    expect(after.availablePaise).toBe(400_00n);
  });

  it("commits once however many times the webhook arrives", async () => {
    const reservationId = `res_COMMIT_${Date.now()}`;
    await ledger.reserve({
      authorizationId: authId,
      orderId: "ord_COMMIT",
      reservationId,
      amountPaise: 100_00n,
      maxAmountPaise: MAX,
      expiresAt: new Date(Date.now() + 600_000),
    });

    const first = await ledger.commit(reservationId);
    const second = await ledger.commit(reservationId);
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.amountPaise).toBe(100_00n);

    const rows = (await db.execute(sql`
      select count(*)::text as n from authorization_ledger
      where reservation_id = ${reservationId} and entry_type = 'COMMIT'
    `)) as unknown as { n: string }[];
    expect(rows[0].n).toBe("1");
  });

  it("moves money from held to debited on commit, not on reserve", async () => {
    const reservationId = `res_MOVE_${Date.now()}`;
    await ledger.reserve({
      authorizationId: authId,
      orderId: "ord_MOVE",
      reservationId,
      amountPaise: 50_00n,
      maxAmountPaise: MAX,
      expiresAt: new Date(Date.now() + 600_000),
    });
    const held = await ledger.balances(authId, MAX);

    await ledger.commit(reservationId);
    const debited = await ledger.balances(authId, MAX);

    expect(debited.heldPaise).toBe(held.heldPaise - 50_00n);
    expect(debited.debitedPaise).toBe(held.debitedPaise + 50_00n);
    expect(debited.availablePaise).toBe(held.availablePaise);
  });

  it("gives the money back on release", async () => {
    const reservationId = `res_REL_${Date.now()}`;
    await ledger.reserve({
      authorizationId: authId,
      orderId: "ord_REL",
      reservationId,
      amountPaise: 75_00n,
      maxAmountPaise: MAX,
      expiresAt: new Date(Date.now() + 600_000),
    });
    const before = await ledger.balances(authId, MAX);

    await ledger.release(reservationId);
    const after = await ledger.balances(authId, MAX);

    expect(after.availablePaise).toBe(before.availablePaise + 75_00n);
    expect(after.debitedPaise).toBe(before.debitedPaise);
  });
});
