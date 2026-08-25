// The authorization device: the only process here that holds a payment credential.
//
//   npm run device            settles every order awaiting authorization
//   npm run device <orderId>  settles one
//
// This is the architecture, not a workaround. The agent is handed a URL and never a credential;
// something the human controls authorises the spend. Reserve Pay works the same way, and it is why
// pay() itself never moves money.
//
// The walk is the one the day-0 gate proved: contact gate -> domestic card -> decline card-save ->
// Razorpay's own OTP screen. UPI is not an option (GET /v1/preferences reports upi:false).
import { chromium, type Frame, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/core/db";
import { orders } from "@/core/db/schema";
import { formatInr } from "@/core/money";
import { getPaymentLink } from "@/core/razorpay";
import { settleOrder } from "@/core/orders/settle";

const CARD = { number: "5267318187975449", expiry: "1230", cvv: "123", name: "Vouch Device", email: "device@vouch.test" };
const MOBILE = "9123456789";
const OTP = "123456";

const only = process.argv[2];

function checkout(page: Page): Frame {
  const frame = page.frames().find((f) => f.url().includes("/checkout/"));
  if (!frame) throw new Error("no checkout frame");
  return frame;
}

/** Which frame hosts a step is not stable across Razorpay builds, so search all of them. */
async function findFrame(page: Page, selector: string, tries = 12): Promise<Frame | null> {
  for (let i = 0; i < tries; i++) {
    for (const f of page.frames()) {
      if (await f.locator(selector).first().count().catch(() => 0)) return f;
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

async function type(frame: Frame, selector: string, value: string): Promise<void> {
  const input = frame.locator(selector).first();
  try {
    await input.click({ timeout: 6000 });
    // Typed, not filled: Razorpay's validators listen per keystroke and reject a programmatic set.
    await input.pressSequentially(value, { delay: 40 });
  } catch {
    // Name and email only render for some card types. A hard wait would cost 30s for nothing.
  }
}

async function authorize(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const contact = checkout(page);
  await type(contact, 'input[placeholder*="obile" i], input[type="tel"]', MOBILE);
  await contact.waitForTimeout(800);
  await contact.getByRole("button", { name: /continue|proceed/i }).first().click();
  await page.waitForTimeout(2500);

  await checkout(page).getByText(/^Cards?$/i).first().click();
  await page.waitForTimeout(2500);

  const card = checkout(page);
  await type(card, 'input[placeholder*="card number" i]', CARD.number);
  await type(card, 'input[placeholder*="MM" i]', CARD.expiry);
  await type(card, 'input[placeholder*="CVV" i]', CARD.cvv);
  await type(card, 'input[placeholder*="name on card" i]', CARD.name);
  await type(card, 'input[placeholder*="Email" i]', CARD.email);
  await page.waitForTimeout(1500);

  await checkout(page).getByRole("button", { name: /pay|proceed|continue/i }).first().click();
  await page.waitForTimeout(2500);

  const later = checkout(page).getByRole("button", { name: /maybe later|not now|skip/i }).first();
  if (await later.count()) await later.click();

  const otpFrame = await findFrame(page, 'input[placeholder*="OTP" i]');
  if (!otpFrame) throw new Error("no OTP screen reached");

  const otp = otpFrame.locator('input[placeholder*="OTP" i]').first();
  await otp.click();
  await otp.pressSequentially(OTP, { delay: 60 });
  // The submit button carries no accessible name, so Enter is the reliable way to submit.
  await otp.press("Enter");
  await page.waitForTimeout(8000);
}

/** Razorpay is the authority on whether it captured, not the browser we just drove. */
async function confirm(linkId: string): Promise<{ paid: boolean; paymentId: string | null }> {
  for (let i = 0; i < 10; i++) {
    const link = await getPaymentLink(linkId);
    const payment = link.payments?.find((p) => p.status === "captured");
    if (link.status === "paid" && payment) return { paid: true, paymentId: payment.payment_id };
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { paid: false, paymentId: null };
}

async function main(): Promise<void> {
  const db = getDb();
  const pending = only
    ? await db.select().from(orders).where(eq(orders.id, only))
    : await db.select().from(orders).where(inArray(orders.state, ["AWAITING_AUTHORIZATION", "ESCALATED"]));

  if (pending.length === 0) {
    console.error("nothing awaiting authorization");
    return;
  }

  mkdirSync("evidence", { recursive: true });
  const browser = await chromium.launch();

  for (const order of pending) {
    if (!order.authorizationUrl || !order.razorpayPaymentLinkId) {
      console.error(`${order.id}: no authorization url, skipping`);
      continue;
    }
    console.error(`${order.id} ${formatInr(order.amountPaise)} -> ${order.authorizationUrl}`);

    const ctx = await browser.newContext();
    // The trace is itself evidence: it shows a device, not a person, completing the payment.
    await ctx.tracing.start({ screenshots: true, snapshots: true });
    const page = await ctx.newPage();

    try {
      await authorize(page, order.authorizationUrl);
    } catch (error) {
      console.error(`   walk failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }

    await ctx.tracing.stop({ path: `evidence/device-${order.id}.zip` });
    await ctx.close();

    const { paid, paymentId } = await confirm(order.razorpayPaymentLinkId);
    if (!paid) {
      console.error("   not captured");
      continue;
    }

    // No webhook reached us here, so the receipt will say mode:"polled". Never claim a signature
    // we did not verify.
    const settlement = await settleOrder(order.id, paymentId, { source: "polled" });
    console.error(`   captured ${paymentId} -> ${settlement.changed ? `PAID, receipt ${settlement.receiptId}` : "already settled"}`);
  }

  await browser.close();
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
