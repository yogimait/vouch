// Demo 5's acceptance test: export a receipt, change one field, and be told which block changed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const SECRET = "test_receipt_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;

const RUN = Boolean(process.env.DATABASE_URL && process.env.VOUCH_SIGNING_PRIVATE_KEY);
const suite = RUN ? describe : describe.skip;

suite("dispute-grade receipt", () => {
  let db: ReturnType<typeof import("@/core/db").getDb>;
  let schema: typeof import("@/core/db/schema");
  let ledger: typeof import("@/core/ledger");
  let handleWebhook: typeof import("@/core/orders/webhook").handleWebhook;
  let verifyBundle: typeof import("@/core/receipts/verify").verifyBundle;
  let exportBundle: typeof import("@/core/receipts/verify").exportBundle;
  let verifyStored: typeof import("@/core/receipts/verify").verifyStored;
  let canonicalJson: typeof import("@/core/canonical").canonicalJson;

  const MAX = 1000_00n;
  const AMOUNT = 300_00n;
  const stamp = Date.now();
  const authId = `auth_RC${stamp}`;
  const offerId = `off_RC${stamp}`;
  const orderId = `ord_RC${stamp}`;

  // 30s, matching the other DB-backed suites: this fixture makes ~20 round trips to a hosted
  // Postgres and then settles through the real webhook path. Vitest's 10s default was a coin flip on
  // a slow link, and a timing-out fixture reads like a receipt bug that is not there.
  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    schema = await import("@/core/db/schema");
    ledger = await import("@/core/ledger");
    handleWebhook = (await import("@/core/orders/webhook")).handleWebhook;
    ({ verifyBundle, exportBundle, verifyStored } = await import("@/core/receipts/verify"));
    ({ canonicalJson } = await import("@/core/canonical"));

    const [merchant] = await db.select().from(schema.merchants).limit(1);
    const [agent] = await db.select().from(schema.buyerAgents).limit(1);
    const [item] = await db.select().from(schema.catalogItems).limit(1);
    if (!merchant || !agent || !item) throw new Error("Run `npm run db:seed` first.");

    await db.insert(schema.authorizations).values({
      id: authId, agentId: agent.id, merchantId: merchant.id,
      maxAmountPaise: MAX, maxPerOrderPaise: MAX,
      expireAt: new Date(Date.now() + 86_400_000),
      grantedBy: "person:priya@example.com", grantedVia: "test", grantSignature: "sig_RC",
    });
    await db.insert(schema.offers).values({
      id: offerId, merchantId: merchant.id, agentId: agent.id, authorizationId: authId,
      sku: item.sku, qty: 1, unitPricePaise: AMOUNT, totalPaise: AMOUNT,
      nonce: `nonce_RC${stamp}`, token: `token_RC${stamp}`,
      expiresAt: new Date(Date.now() + 600_000),
    });
    await db.insert(schema.orders).values({
      id: orderId, agentId: agent.id, authorizationId: authId, offerId,
      idempotencyKey: `idem_RC${stamp}`, amountPaise: AMOUNT, state: "AWAITING_AUTHORIZATION",
      razorpayOrderId: `order_RC${stamp}`, razorpayPaymentLinkId: `plink_RC${stamp}`,
    });
    await db.insert(schema.decisions).values({
      id: `dec_RC${stamp}`, agentId: agent.id, orderId, offerId, authorizationId: authId,
      outcome: "ADMIT", matchedRules: ["agent.status", "offer.signature"], reasons: [],
      policySnapshot: { maxAmountPaise: MAX.toString() }, engineVersion: "vouch-engine-1",
      authorizationBalanceBeforePaise: MAX, latencyMs: 12, source: "harness",
    });
    await ledger.reserve({
      authorizationId: authId, orderId, reservationId: orderId,
      amountPaise: AMOUNT, maxAmountPaise: MAX, expiresAt: new Date(Date.now() + 600_000),
    });

    // Settle it the way production does, so the receipt is built by the real path.
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_RC${stamp}`, order_id: `order_RC${stamp}`,
        amount: Number(AMOUNT), notes: { vouch_order_id: orderId } } } },
    });
    await handleWebhook(raw, createHmac("sha256", SECRET).update(raw).digest("hex"));
  });

  afterAll(async () => {
    await db.execute(sql`delete from receipts where order_id = ${orderId}`);
    await db.execute(sql`delete from webhook_events where order_id = ${orderId}`);
    await db.execute(sql`delete from audit_log where order_id = ${orderId}`);
    await db.execute(sql`delete from decisions where order_id = ${orderId}`);
    await db.execute(sql`delete from authorization_ledger where authorization_id = ${authId}`);
    await db.delete(schema.orders).where(eq(schema.orders.id, orderId));
    await db.delete(schema.offers).where(eq(schema.offers.id, offerId));
    await db.delete(schema.authorizations).where(eq(schema.authorizations.id, authId));
  });

  it("is issued automatically when the order settles", async () => {
    const [row] = await db.select().from(schema.receipts).where(eq(schema.receipts.orderId, orderId));
    expect(row).toBeDefined();
    expect(Object.keys(row.blockHashes).sort()).toEqual(
      ["audit", "authorization", "decision", "offer", "payment", "policy"],
    );
  });

  it("verifies untouched, chain included", async () => {
    const loaded = await verifyStored(orderId);
    if (!loaded.ok) throw new Error(loaded.code);
    expect(loaded.verification.signatureValid).toBe(true);
    expect(loaded.verification.tamperedBlocks).toEqual([]);
    expect(loaded.verification.chain?.valid).toBe(true);
    expect(loaded.verification.valid).toBe(true);
  });

  it("answers the four dispute questions in the blocks", async () => {
    const loaded = await exportBundle(orderId);
    if (!loaded.ok) throw new Error(loaded.code);
    const body = JSON.parse(loaded.bundle.receipt);

    expect(body.blocks.authorization.granted_by).toBe("person:priya@example.com");
    expect(body.blocks.authorization.max_amount_paise).toBe(MAX.toString());
    expect(body.blocks.policy.snapshot).toBeDefined();
    expect(body.blocks.decision.outcome).toBe("ADMIT");
    expect(body.blocks.decision.authorization_debited_after_paise).toBe(AMOUNT.toString());
    expect(body.blocks.payment.webhook.signature_verified).toBe(true);
    expect(body.blocks.payment.webhook.raw_body_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names the payment block when a payment field is edited", async () => {
    const loaded = await exportBundle(orderId);
    if (!loaded.ok) throw new Error(loaded.code);

    const body = JSON.parse(loaded.bundle.receipt);
    body.blocks.payment.amount_paise = "1";
    const tampered = { ...loaded.bundle, receipt: canonicalJson(body) };

    const result = verifyBundle(tampered);
    expect(result.tamperedBlocks).toEqual(["payment"]);
    expect(result.valid).toBe(false);
  });

  it("names the authorization block when the granted-by is rewritten", async () => {
    const loaded = await exportBundle(orderId);
    if (!loaded.ok) throw new Error(loaded.code);

    const body = JSON.parse(loaded.bundle.receipt);
    body.blocks.authorization.granted_by = "person:someone-else@example.com";
    const result = verifyBundle({ ...loaded.bundle, receipt: canonicalJson(body) });

    expect(result.tamperedBlocks).toEqual(["authorization"]);
  });

  it("still fails when the block hashes are rewritten to match the edit", async () => {
    const loaded = await exportBundle(orderId);
    if (!loaded.ok) throw new Error(loaded.code);

    const body = JSON.parse(loaded.bundle.receipt);
    body.blocks.decision.outcome = "REFUSE";
    // Cover the tracks: recompute the block hash so the per-block check passes.
    const { hashBlock } = await import("@/core/receipts/build");
    body.block_hashes.decision = hashBlock(body.blocks.decision);

    const result = verifyBundle({ ...loaded.bundle, receipt: canonicalJson(body) });
    expect(result.tamperedBlocks).toEqual([]);
    expect(result.signatureValid).toBe(false);
    expect(result.valid).toBe(false);
  });

  // The central claim is "every paid order emits a receipt". settleOrder deliberately swallows a
  // receipt failure so a receipt bug cannot become a Razorpay retry storm, which left exactly one
  // way for that claim to be false: a transient failure at settlement, then a 404 forever.
  it("re-issues a receipt that settlement failed to write", async () => {
    const before = await exportBundle(orderId);
    if (!before.ok) throw new Error(before.code);

    // Exactly the state a swallowed issueReceipt leaves behind: PAID, money committed, no receipt.
    await db.execute(sql`delete from receipts where order_id = ${orderId}`);
    const [gone] = await db.select().from(schema.receipts)
      .where(eq(schema.receipts.orderId, orderId));
    expect(gone).toBeUndefined();

    const healed = await exportBundle(orderId);
    expect(healed.ok).toBe(true);
    if (!healed.ok) return;
    expect(healed.verification.valid).toBe(true);
    expect(healed.verification.signatureValid).toBe(true);

    // Re-issued, not resurrected: same order, same six blocks, and it verifies on its own terms.
    const body = JSON.parse(healed.bundle.receipt);
    expect(Object.keys(body.block_hashes).sort())
      .toEqual(["audit", "authorization", "decision", "offer", "payment", "policy"]);
  });

  it("does not issue a second receipt when read again", async () => {
    await exportBundle(orderId);
    await exportBundle(orderId);

    const rows = (await db.execute(sql`
      select count(*)::text as n from receipts where order_id = ${orderId}
    `)) as unknown as { n: string }[];
    expect(rows[0].n).toBe("1");
  });

  it("rejects a bundle carrying someone else's public key", async () => {
    const loaded = await exportBundle(orderId);
    if (!loaded.ok) throw new Error(loaded.code);

    const { generateKeyPair } = await import("@/core/crypto/keys");
    const other = generateKeyPair();
    const result = verifyBundle({ ...loaded.bundle, public_key: other.publicKey });

    expect(result.signatureValid).toBe(false);
    expect(result.tamperedBlocks).toEqual([]);
    expect(result.valid).toBe(false);
  });
}, 30_000);
