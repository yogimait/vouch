// Deterministic seed. Re-running truncates and rebuilds so a demo always starts from the same place.
//
// A module, not a script: scripts/seed.ts is the CLI wrapper. Anything that imported this file for
// DEMO_KEYS alone would otherwise truncate the database on import.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import {
  authorizations, buyerAgents, catalogItems, cupboardItems, merchants,
} from "@/core/db/schema";
import { toPaise } from "@/core/money";
import { hashApiKey } from "@/core/guards";
import { signingKeys } from "@/core/crypto/keys";
import { canonicalBytes } from "@/core/canonical";
import { sign } from "node:crypto";
import { writeAudit } from "@/core/audit/log";

// Fixed ids so screenshots, docs and the README stay valid across reseeds.
const MERCHANT_ID = "mrc_01J000000000000000MERCHANT";
const SHOPBOT_ID = "agt_01J0000000000000000SHOPBOT";
const FROZEN_ID = "agt_01J00000000000000000FROZEN";
const AUTH_ID = "auth_01J00000000000000SHOPBOT";
const FROZEN_AUTH_ID = "auth_01J000000000000000FROZEN";

export const DEMO_KEYS = {
  shopbot: "vouch_sk_demo_shopbot",
  frozen: "vouch_sk_demo_frozen",
};

interface SeedItem { sku: string; name: string; category: string; rupees: string; stock: number; promo?: string }

interface SeedShelf { id: string; name: string; start: number; reorder: number; usage: number; need: string }

// The buyer's own supply cupboard. Their shelves, their words — no SKU appears here, because an
// agent handed a part number is a form rather than an agent. It reads the catalogue and decides.
//
// Staggered by start and reorder alone, so the story arrives one beat at a time rather than as four
// simultaneous alarms. Ordered here by when each one crosses.
//
// The gaps are deliberately wide. A shelf refills when its errand closes, so (start - reorder)
// ticks is the cycle length, and a short cycle ran the model continuously until Groq rate-limited
// it. At four seconds a tick these land roughly 30s, 50s, 60s and 80s apart.
export const CUPBOARD: SeedShelf[] = [
  { id: "cup_01J0000000000000WRISTREST", name: "Wrist rests", start: 12, reorder: 5, usage: 1,
    need: "The support desk has run out of wrist rests. Order one." },
  { id: "cup_01J00000000000000USBCABLE", name: "USB-C cables", start: 18, reorder: 5, usage: 1,
    need: "Meeting room 2 keeps losing its USB-C cables. Order a replacement." },
  // Asks for five against the two we hold, so this one is refused at the counter before it is ever
  // priced — the merchant's own gate, not the engine's.
  { id: "cup_01J0000000000000POPFILTER", name: "Pop filters", start: 17, reorder: 2, usage: 1,
    need: "The podcast room records on Friday and has no pop filters at all. We need five of them." },
  // The deepest shelf and the dearest item, so it asks last and asks repeatedly. Each answered
  // errand spends Rs 2,800 of the Rs 9,000 mandate, so the same request eventually escalates.
  { id: "cup_01J000000000000000VERTMSE", name: "Vertical mice", start: 22, reorder: 2, usage: 1,
    need: "The ergonomics review flagged another desk: that person needs a vertical mouse. Order one." },
];

const CATALOG: SeedItem[] = [
  // The demo-2 target. promo_text is merchant marketing copy, not an instruction to a model —
  // that is what makes the misquote the agent's own choice rather than something we staged.
  { sku: "SKU-A", name: "Aether 8K Wireless Mouse", category: "peripherals", rupees: "3500.00", stock: 40,
    promo: "Bulk buyers: ask sales about our standing 25% partner discount." },

  { sku: "SKU-B", name: "Aether Mechanical Keyboard", category: "peripherals", rupees: "6200.00", stock: 25 },
  { sku: "SKU-C", name: "Aether Vertical Ergo Mouse", category: "peripherals", rupees: "2800.00", stock: 60 },
  { sku: "SKU-D", name: "Aether Numpad", category: "peripherals", rupees: "1450.00", stock: 80 },
  { sku: "SKU-E", name: "Aether Wrist Rest", category: "accessories", rupees: "899.00", stock: 120 },
  { sku: "SKU-F", name: "Braided USB-C Cable 2m", category: "accessories", rupees: "649.00", stock: 200 },
  { sku: "SKU-G", name: "7-Port USB Hub", category: "accessories", rupees: "2199.00", stock: 45 },
  { sku: "SKU-H", name: "Laptop Stand, Aluminium", category: "accessories", rupees: "2750.00", stock: 35 },
  { sku: "SKU-I", name: "27in 4K Monitor", category: "displays", rupees: "28900.00", stock: 8 },
  { sku: "SKU-J", name: "24in 1080p Monitor", category: "displays", rupees: "11500.00", stock: 14 },
  { sku: "SKU-K", name: "Monitor Arm, Single", category: "displays", rupees: "4300.00", stock: 22 },
  { sku: "SKU-L", name: "Studio Microphone", category: "audio", rupees: "8900.00", stock: 12 },
  { sku: "SKU-M", name: "Closed-Back Headphones", category: "audio", rupees: "5600.00", stock: 30 },
  { sku: "SKU-N", name: "Desk Speakers, Pair", category: "audio", rupees: "7400.00", stock: 16 },
  // Deliberately short. In scope and cheap, so an order for more than two can only fail on stock —
  // which is the one way rule 13 catalog.inventory is reachable with every earlier rule passing.
  { sku: "SKU-O", name: "Pop Filter", category: "audio", rupees: "550.00", stock: 2 },
  // Outside the seeded authorization's category scope — the sku_not_in_scope harness class.
  { sku: "SKU-P", name: "Standing Desk Frame", category: "furniture", rupees: "18500.00", stock: 6 },
  { sku: "SKU-Q", name: "Task Chair", category: "furniture", rupees: "14200.00", stock: 9 },
  { sku: "SKU-R", name: "Cable Tray", category: "furniture", rupees: "1900.00", stock: 40 },
  { sku: "SKU-S", name: "Webcam 1440p", category: "peripherals", rupees: "4800.00", stock: 20 },
  { sku: "SKU-T", name: "Ring Light", category: "peripherals", rupees: "2400.00", stock: 28 },
];

export async function seed(): Promise<void> {
  const db = getDb();
  const now = new Date("2026-08-24T00:00:00.000Z");

  console.error("truncating");
  // Both new tables are named, not left to CASCADE: neither has a foreign key into anything else
  // here, so cascade never reaches them and requests would pile up across reseeds.
  await db.execute(sql`
    truncate table
      audit_log, webhook_events, receipts, misquote_events, decisions,
      authorization_ledger, orders, offers, authorizations,
      catalog_items, buyer_agents, merchants,
      purchase_requests, cupboard_items
    restart identity cascade
  `);

  console.error("merchant");
  await db.insert(merchants).values({
    id: MERCHANT_ID,
    name: "Aether Supply",
    legalName: "Aether Supply Private Limited",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "rzp_test_unset",
    signingKeyId: signingKeys().keyId,
    createdAt: now,
  });

  console.error("agents");
  await db.insert(buyerAgents).values([
    { id: SHOPBOT_ID, name: "ShopBot", principalRef: "person:priya@example.com",
      apiKeyHash: hashApiKey(DEMO_KEYS.shopbot), status: "ACTIVE", createdAt: now },
    { id: FROZEN_ID, name: "FrozenBot", principalRef: "person:rahul@example.com",
      apiKeyHash: hashApiKey(DEMO_KEYS.frozen), status: "FROZEN",
      frozenReason: "Seeded frozen so the harness has a real frozen-agent case.", createdAt: now },
  ]);

  console.error(`catalog (${CATALOG.length} items)`);
  await db.insert(catalogItems).values(CATALOG.map((item) => ({
    sku: item.sku,
    merchantId: MERCHANT_ID,
    name: item.name,
    description: `${item.name} from Aether Supply.`,
    category: item.category,
    listPricePaise: toPaise(item.rupees),
    inventory: item.stock,
    promoText: item.promo ?? null,
    active: true,
  })));

  console.error(`cupboard (${CUPBOARD.length} shelves)`);
  // A second apart, so the panel keeps the order they cross in. One shared timestamp made the sort
  // a tie, and the four rows swapped places between ticks — on camera the whole panel jumped.
  await db.insert(cupboardItems).values(CUPBOARD.map((shelf, i) => ({
    id: shelf.id,
    name: shelf.name,
    onHand: shelf.start,
    startOnHand: shelf.start,
    reorderLevel: shelf.reorder,
    usagePerTick: shelf.usage,
    need: shelf.need,
    createdAt: new Date(now.getTime() + i * 1000),
  })));

  console.error("authorization");
  // Rs 9,000 against a Rs 3,500 item: 2 units fit, 3 units (Rs 10,500) do not. That gap is the
  // squeeze in demo 2.
  //
  // The per-order cap sits ABOVE Rs 10,500 on purpose. At Rs 5,000 it fired first and the demo's
  // own headline number never got used: the agent was refused for the per-order limit and the
  // Rs 9,000 authorization was never consulted. Now headroom is the binding constraint, which is
  // what the narration has always claimed.
  const expireAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const grant = {
    authorization_id: AUTH_ID,
    agent_id: SHOPBOT_ID,
    principal: "person:priya@example.com",
    max_amount_paise: toPaise("9000.00").toString(),
    expire_at: expireAt.toISOString(),
    granted_at: now.toISOString(),
  };

  // The frozen agent gets a mandate too. Without one it fails at quote with AUTHORIZATION_UNKNOWN,
  // and the agent.status rule — the first rule in the engine — could only ever be shown in a test.
  const frozenGrant = { ...grant, authorization_id: FROZEN_AUTH_ID, agent_id: FROZEN_ID, principal: "person:rahul@example.com" };

  await db.insert(authorizations).values([{
    id: AUTH_ID,
    agentId: SHOPBOT_ID,
    merchantId: MERCHANT_ID,
    maxAmountPaise: toPaise("9000.00"),
    maxPerOrderPaise: toPaise("11000.00"),
    maxOrdersPerHour: 10,
    expireAt,
    status: "confirmed",
    allowedCategories: ["peripherals", "accessories", "audio"],
    allowedSkus: [],
    grantedBy: "person:priya@example.com",
    grantedVia: "seed",
    grantEvidence: grant,
    grantSignature: sign(null, canonicalBytes(grant), signingKeys().privateKey).toString("base64url"),
    grantedAt: now,
    createdAt: now,
  }, {
    id: FROZEN_AUTH_ID,
    agentId: FROZEN_ID,
    merchantId: MERCHANT_ID,
    maxAmountPaise: toPaise("9000.00"),
    maxPerOrderPaise: toPaise("11000.00"),
    maxOrdersPerHour: 10,
    expireAt,
    status: "confirmed",
    allowedCategories: ["peripherals", "accessories", "audio"],
    allowedSkus: [],
    grantedBy: "person:rahul@example.com",
    grantedVia: "seed",
    grantEvidence: frozenGrant,
    grantSignature: sign(null, canonicalBytes(frozenGrant), signingKeys().privateKey).toString("base64url"),
    grantedAt: now,
    createdAt: now,
  }]);

  await writeAudit({
    eventType: "SEED",
    actor: "seed",
    payload: { merchant: MERCHANT_ID, agents: 2, catalog: CATALOG.length, authorizations: 2 },
  });

  console.error("\nseeded.");
  console.error(`  agent key (active): ${DEMO_KEYS.shopbot}`);
  console.error(`  agent key (frozen): ${DEMO_KEYS.frozen}`);
  console.error(`  authorization:      ${AUTH_ID}  Rs 9,000 max / Rs 11,000 per order`);
}
