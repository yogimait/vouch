// Derived from the five screens in docs/PLAN.md §4.1, in that order.
// Money is always bigint paise. Balances are never stored — they are derived from the ledger.
import { sql } from "drizzle-orm";
import {
  bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export const agentStatus = pgEnum("agent_status", ["ACTIVE", "FROZEN"]);

// Razorpay's own UPI Reserve Pay values, so the field means the same thing on both sides.
export const authorizationStatus = pgEnum("authorization_status", [
  "initiated", "confirmed", "rejected", "expired", "completed",
]);

// No REFUSED: a refusal produces a decision and no order at all.
export const orderState = pgEnum("order_state", [
  "ADMITTED", "AWAITING_AUTHORIZATION", "ESCALATED", "PAID", "FAILED", "EXPIRED",
]);

export const decisionOutcome = pgEnum("decision_outcome", ["ADMIT", "ESCALATE", "REFUSE"]);
export const ledgerEntryType = pgEnum("ledger_entry_type", ["RESERVE", "COMMIT", "RELEASE"]);
export const decisionSource = pgEnum("decision_source", ["mcp", "http", "llm", "harness"]);

export const misquoteKind = pgEnum("misquote_kind", [
  "CLAIMED_TOTAL_MISMATCH", "UNKNOWN_DISCOUNT_CODE", "TOKEN_TAMPERED",
  "TOKEN_EXPIRED", "TOKEN_WRONG_AGENT", "TOKEN_REPLAYED",
]);

const money = (name: string) => bigint(name, { mode: "bigint" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Screen 3 — the receipt needs merchant identity.
export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  legalName: text("legal_name").notNull(),
  razorpayKeyId: text("razorpay_key_id").notNull(),
  signingKeyId: text("signing_key_id").notNull(),
  createdAt: createdAt(),
});

// Screens 1, 2, 4. principal_ref is the human this agent acts for — receipt question #1.
export const buyerAgents = pgTable("buyer_agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  principalRef: text("principal_ref").notNull(),
  apiKeyHash: text("api_key_hash").notNull(),
  status: agentStatus("status").notNull().default("ACTIVE"),
  frozenReason: text("frozen_reason"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("agents_api_key_unique").on(t.apiKeyHash)]);

// Screen 1 shows what was attempted. promo_text is merchant marketing copy, and the demo-2 bait.
export const catalogItems = pgTable("catalog_items", {
  sku: text("sku").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  listPricePaise: money("list_price_paise").notNull(),
  inventory: integer("inventory").notNull().default(0),
  promoText: text("promo_text"),
  active: boolean("active").notNull().default(true),
}, (t) => [index("catalog_merchant_active_idx").on(t.merchantId, t.active)]);

// Screen 2. Razorpay's Reserve Pay field names verbatim.
// No amount_debited column: it is derived from the ledger. A stored balance drifts under concurrency.
export const authorizations = pgTable("authorizations", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => buyerAgents.id),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),

  tokenType: text("token_type").notNull().default("single_block_multiple_debit"),
  frequency: text("frequency").notNull().default("as_presented"),
  maxAmountPaise: money("max_amount_paise").notNull(),
  expireAt: timestamp("expire_at", { withTimezone: true }).notNull(),
  status: authorizationStatus("status").notNull().default("confirmed"),

  allowedCategories: text("allowed_categories").array().notNull().default(sql`'{}'::text[]`),
  allowedSkus: text("allowed_skus").array().notNull().default(sql`'{}'::text[]`),
  maxPerOrderPaise: money("max_per_order_paise").notNull(),
  maxOrdersPerHour: integer("max_orders_per_hour").notNull().default(10),

  grantedBy: text("granted_by").notNull(),
  grantedVia: text("granted_via").notNull(),
  grantEvidence: jsonb("grant_evidence").$type<Record<string, unknown>>(),
  grantSignature: text("grant_signature").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("auth_agent_status_idx").on(t.agentId, t.status),
  index("auth_expire_idx").on(t.expireAt),
]);

// Screen 2's three balances. Append-only. available = max_amount - debited - held.
export const authorizationLedger = pgTable("authorization_ledger", {
  id: text("id").primaryKey(),
  authorizationId: text("authorization_id").notNull().references(() => authorizations.id),
  orderId: text("order_id"),
  reservationId: text("reservation_id").notNull(),
  entryType: ledgerEntryType("entry_type").notNull(),
  amountPaise: money("amount_paise").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("ledger_auth_idx").on(t.authorizationId),
  index("ledger_reservation_idx").on(t.reservationId),
  index("ledger_expires_idx").on(t.expiresAt),
  // A webhook can arrive twice. This is what makes double-debit impossible, not the code that checks.
  uniqueIndex("ledger_reservation_type_unique").on(t.reservationId, t.entryType),
]);

// Screens 1, 3. The full signed token is stored so the receipt can embed it verbatim and a third
// party can confirm the merchant signed that exact price.
export const offers = pgTable("offers", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  agentId: text("agent_id").notNull().references(() => buyerAgents.id),
  authorizationId: text("authorization_id").notNull().references(() => authorizations.id),
  sku: text("sku").notNull().references(() => catalogItems.sku),
  qty: integer("qty").notNull(),
  unitPricePaise: money("unit_price_paise").notNull(),
  totalPaise: money("total_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  nonce: text("nonce").notNull(),
  token: text("token").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("offers_nonce_unique").on(t.nonce),
  index("offers_agent_expiry_idx").on(t.agentId, t.expiresAt),
]);

// Screens 2, 3, 5. unique(offer_id) makes offer replay a database constraint, not app logic.
export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => buyerAgents.id),
  authorizationId: text("authorization_id").notNull().references(() => authorizations.id),
  offerId: text("offer_id").notNull().references(() => offers.id),
  idempotencyKey: text("idempotency_key").notNull(),
  amountPaise: money("amount_paise").notNull(),
  state: orderState("state").notNull().default("ADMITTED"),

  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentLinkId: text("razorpay_payment_link_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  authorizationUrl: text("authorization_url"),

  failureReason: text("failure_reason"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  // The deadline lives here, not only on the ledger row: an ESCALATE reserves nothing, so a
  // ledger-only sweep could never find one. The default is kept rather than dropped after the
  // backfill -- an insert that forgets a deadline then expires immediately, which is the direction
  // everything else in this file already fails.
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("orders_idempotency_unique").on(t.agentId, t.idempotencyKey),
  uniqueIndex("orders_offer_unique").on(t.offerId),
  uniqueIndex("orders_rzp_payment_unique").on(t.razorpayPaymentId),
  index("orders_state_idx").on(t.state),
  index("orders_created_idx").on(t.createdAt),
  index("orders_expires_idx").on(t.expiresAt),
]);

// Screens 1, 5. THE GATE LEDGER, deliberately separate from orders (the settlement ledger).
// A refusal writes a decision and no order, which is what makes "never blend gate and settlement
// numbers" structural instead of a discipline someone has to remember.
export const decisions = pgTable("decisions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => buyerAgents.id),
  orderId: text("order_id"),
  offerId: text("offer_id"),
  authorizationId: text("authorization_id"),

  outcome: decisionOutcome("outcome").notNull(),
  reasons: jsonb("reasons").$type<DecisionReason[]>().notNull().default(sql`'[]'::jsonb`),
  matchedRules: jsonb("matched_rules").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  escalatable: boolean("escalatable").notNull().default(false),

  // The full policy as it was, not a foreign key. A pointer is worthless in a dispute 120 days later.
  policyVersion: integer("policy_version").notNull().default(1),
  policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),

  authorizationBalanceBeforePaise: money("authorization_balance_before_paise"),
  latencyMs: integer("latency_ms").notNull().default(0),
  engineVersion: text("engine_version").notNull(),

  source: decisionSource("source").notNull(),
  label: text("label"),
  createdAt: createdAt(),
}, (t) => [
  index("decisions_created_idx").on(t.createdAt),
  index("decisions_outcome_idx").on(t.outcome),
  index("decisions_source_label_idx").on(t.source, t.label),
]);

// Screen 4. raw_agent_text is the video's money shot.
export const misquoteEvents = pgTable("misquote_events", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => buyerAgents.id),
  offerId: text("offer_id"),
  decisionId: text("decision_id"),
  kind: misquoteKind("kind").notNull(),
  claimedPaise: money("claimed_paise"),
  signedPaise: money("signed_paise"),
  claimedDiscountCode: text("claimed_discount_code"),
  rawAgentText: text("raw_agent_text"),
  source: decisionSource("source").notNull(),
  createdAt: createdAt(),
}, (t) => [index("misquote_source_created_idx").on(t.source, t.createdAt)]);

// Screen 3. body is TEXT, not jsonb: jsonb does not preserve key order and normalises numbers
// (1.0 -> 1), so a round trip would break the signature.
export const receipts = pgTable("receipts", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  body: text("body").notNull(),
  bodyHash: text("body_hash").notNull(),
  blockHashes: jsonb("block_hashes").$type<Record<string, string>>().notNull(),
  signature: text("signature").notNull(),
  keyId: text("key_id").notNull(),
  chainSeqFrom: bigint("chain_seq_from", { mode: "bigint" }),
  chainSeqTo: bigint("chain_seq_to", { mode: "bigint" }),
  chainHeadHash: text("chain_head_hash"),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("receipts_order_unique").on(t.orderId)]);

// Screen 3's proof. Raw bytes are kept so the receipt can commit to their hash and the merchant can
// produce them at dispute time. Inserted even when the signature fails — that is evidence too.
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  razorpayEventId: text("razorpay_event_id").notNull(),
  event: text("event").notNull(),
  rawBody: text("raw_body").notNull(),
  rawBodySha256: text("raw_body_sha256").notNull(),
  signatureHeader: text("signature_header"),
  signatureVerified: boolean("signature_verified").notNull(),
  orderId: text("order_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("webhook_event_unique").on(t.razorpayEventId),
  index("webhook_order_idx").on(t.orderId),
]);

// Screen 3's chain anchor. Tamper evidence without a blockchain.
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  agentId: text("agent_id"),
  orderId: text("order_id"),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  prevHash: text("prev_hash").notNull(),
  rowHash: text("row_hash").notNull(),
  seq: bigint("seq", { mode: "bigint" }).notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("audit_seq_unique").on(t.seq),
  index("audit_order_idx").on(t.orderId),
  index("audit_created_idx").on(t.createdAt),
]);

export interface DecisionReason {
  code: string;
  rule: string;
  message: string;
  observed?: string;
  expected?: string | string[];
  escalatable?: boolean;
}

// The buyer's own supply cupboard, and why their agent turns up at our counter. Quantities only —
// a request carries no price and no budget, because pay() has no amount parameter and a budget
// column here would hand back the hole that removing one closed.
export const purchaseRequestSource = pgEnum("purchase_request_source", ["REORDER", "STAFF"]);
export const purchaseRequestStatus = pgEnum("purchase_request_status", ["OPEN", "RUNNING", "CLOSED"]);

// No foreign key to catalog_items, deliberately: their cupboard is not our shelf, and a key here
// would invite handing the agent a SKU. `need` says what a person needs; the agent finds the item.
export const cupboardItems = pgTable("cupboard_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  onHand: integer("on_hand").notNull(),
  // The bar's denominator, and what a floor reset restores. on_hand alone cannot say how full is full.
  startOnHand: integer("start_on_hand").notNull(),
  reorderLevel: integer("reorder_level").notNull(),
  // The calibration knob: staggering these is what makes the crossings arrive one at a time.
  usagePerTick: integer("usage_per_tick").notNull().default(1),
  need: text("need").notNull(),
  createdAt: createdAt(),
});

// One queue for both triggers, so the loop has one place to be idempotent.
export const purchaseRequests = pgTable("purchase_requests", {
  id: text("id").primaryKey(),
  source: purchaseRequestSource("source").notNull(),
  // Soft link, no FK — a staff request belongs to no shelf. decisions does the same for its three.
  cupboardItemId: text("cupboard_item_id"),
  raisedBy: text("raised_by").notNull(),
  need: text("need").notNull(),
  status: purchaseRequestStatus("status").notNull().default("OPEN"),
  // Nullable on purpose: a quote-time refusal writes no decision at all, so there is no outcome to
  // record and inventing one would claim the engine ruled on something it never saw.
  outcome: decisionOutcome("outcome"),
  decisionId: text("decision_id"),
  orderId: text("order_id"),
  words: text("words"),
  createdAt: createdAt(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => [
  index("requests_status_idx").on(t.status, t.createdAt),
  // One open errand per shelf. The insert already checks, but a check races the next tick.
  uniqueIndex("requests_open_item_unique").on(t.cupboardItemId).where(sql`status <> 'CLOSED'`),
]);
