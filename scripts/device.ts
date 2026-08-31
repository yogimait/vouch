// The authorization device: the only process here that holds a payment credential.
//
//   npm run device            settles every order awaiting authorization
//   npm run device <orderId>  settles one
//   npm run device -- --fail   pays with a card this business rejects, so the hold is released
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
import { confirmOrder } from "@/core/orders/confirm";

const FORCE_FAILURE = process.argv.includes("--fail");
// Env, not a flag: demo:1 shells out to this script and inherits the environment, so one variable
// turns recording on for the whole chain without threading an argument through.
const RECORD = process.env.VOUCH_RECORD === "1" || process.argv.includes("--video");

// --fail pays with an INTERNATIONAL card. This business is domestic-only, so Razorpay rejects it
// with "this business accepts domestic (Indian) card payments only" — a real failed payment record.
// A wrong OTP does not work: test mode accepts 999999 and captures anyway, which was measured, not
// assumed. UPI's failure@razorpay is unreachable here because upi is disabled on the account.
const DOMESTIC = "5267318187975449";
const INTERNATIONAL = "4111111111111111";
const CARD = {
  number: FORCE_FAILURE ? INTERNATIONAL : DOMESTIC,
  expiry: "1230", cvv: "123", name: "Vouch Device", email: "device@vouch.test",
};
const MOBILE = "9123456789";
const OTP = "123456";

const only = process.argv.find((a) => a.startsWith("ord_"));

function checkout(page: Page): Frame {
  const frame = page.frames().find((f) => f.url().includes("/checkout/"));
  if (!frame) throw new Error("no checkout frame");
  return frame;
}

/**
 * Waited for, not asserted after a fixed sleep. checkout.js is fetched from Razorpay's CDN into a
 * cold browser context every run, and a one-shot check at five seconds is the whole of the walk's
 * intermittent failure — it reported "no checkout frame" for a frame that arrived a second later.
 */
async function waitForCheckout(page: Page, ms = 45_000): Promise<Frame> {
  const until = Date.now() + ms;
  for (;;) {
    const frame = page.frames().find((f) => f.url().includes("/checkout/"));
    if (frame) return frame;
    if (Date.now() > until) throw new Error("no checkout frame");
    await page.waitForTimeout(500);
  }
}


async function type(frame: Frame, selector: string, value: string): Promise<void> {
  const input = frame.locator(selector).first();
  try {
    if (!(await input.count())) return;
    // The walk revisits the same screen, so a field that already holds a value is left alone —
    // otherwise the second pass appends and the card number becomes 32 digits.
    if ((await input.inputValue()).trim()) return;
    // focus(), not click(). The contact sheet Razorpay shipped on 26 Aug 2026 never satisfies
    // Playwright's pointer hit-test: the trace shows 48 clicks, every one timing out, while every
    // read succeeded. focus() runs no hit-test. Measured at 517ms against the live sheet.
    await input.focus({ timeout: 8000 });
    // Typed, not filled: Razorpay's validators listen per keystroke and reject a programmatic set.
    await frame.page().keyboard.type(value, { delay: 40 });
  } catch {
    // Absent or not editable this round. The loop comes back.
  }
}

// Mobile first. Checkout renders every section at once and covers the inactive ones with
// #overlay-backdrop, so the card fields are visible but not clickable until contact is done.
// Ordering by what is reachable, not by what is on screen, is the difference between this walking
// and this stalling for eight silent rounds.
const FIELDS: [string, string][] = [
  // Placeholder only. Razorpay uses type="tel" for the CARD NUMBER too, so an `input[type=tel]`
  // fallback resolves to the covered card field and the contact step is never filled.
  ['input[placeholder*="obile" i]', MOBILE],
  ['input[placeholder*="card number" i]', CARD.number],
  ['input[placeholder*="MM" i]', CARD.expiry],
  ['input[placeholder*="CVV" i]', CARD.cvv],
  ['input[placeholder*="name on card" i]', CARD.name],
  ['input[placeholder*="Email" i]', CARD.email],
];

// Dismissals before submits, and the order is the whole fix. An interstitial has to be closed
// before the form underneath it can advance, and "Continue" sits earlier in the DOM than
// "Maybe later" — so one regex over both groups force-clicks the buried Continue, reports success,
// and never reaches the dismissal. That stalled the walk on the RBI save-card modal for eight rounds.
const BUTTON_GROUPS = [/^(maybe later|not now|skip)/i, /^(pay|proceed|continue)/i];

/** Several Continue buttons exist at once and most are behind the overlay. Click one that works. */
async function advance(frame: Frame): Promise<boolean> {
  for (const name of BUTTON_GROUPS) {
    const buttons = frame.getByRole("button", { name });
    for (let i = 0; i < await buttons.count(); i++) {
      const button = buttons.nth(i);
      try {
        if (!(await button.isVisible())) continue;
        // force: the same hit-test that stalls the fields stalls the button. Safe because
        // isVisible() already ruled out the hidden duplicates behind the sheet.
        await button.click({ timeout: 2500, force: true });
        return true;
      } catch {
        // Detached mid-click, or disabled. Try the next one.
      }
    }
  }
  return false;
}

/**
 * Searched across every frame, not just the checkout one. Razorpay renders the OTP step in its own
 * nested frame, so looking only where the card fields were found leaves the walk pressing Continue
 * against a screen that has already moved on.
 */
async function otpField(page: Page) {
  const selector = 'input[placeholder*="OTP" i], input[name*="otp" i], input[autocomplete="one-time-code"]';
  for (const frame of page.frames()) {
    const input = frame.locator(selector).first();
    if (await input.count().catch(() => 0)) return input;
  }
  return null;
}

/**
 * Adaptive rather than scripted. Checkout renders two different layouts: a payment link page gates
 * on contact details first, while Standard Checkout on our own page shows methods and the card form
 * at once. Filling whatever is present and pressing Continue handles both, and will survive
 * Razorpay reordering the steps again.
 */
async function authorize(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForCheckout(page);
  await page.waitForTimeout(2000);

  for (let round = 0; round < 8; round++) {
    const frame = checkout(page);

    // Logged every round: a walk that stalls two screens in is otherwise completely opaque, which
    // cost an hour on the day-0 gate.
    const seen = (await frame.evaluate(`(() => ({
      inputs: [...document.querySelectorAll("input")].map(e => e.placeholder || e.name || e.id).filter(Boolean),
      buttons: [...document.querySelectorAll("button")].map(e => (e.innerText||"").trim()).filter(Boolean),
    }))()`).catch(() => ({ inputs: [], buttons: [] }))) as { inputs: string[]; buttons: string[] };
    console.error(`   [${round}] in: ${seen.inputs.join(",") || "-"} | btn: ${seen.buttons.join(",") || "-"}`);

    const otp = await otpField(page);
    if (otp) {
      await otp.click();
      await otp.pressSequentially(OTP, { delay: 60 });
      // The submit button carries no accessible name, so Enter is the reliable way to submit.
      await otp.press("Enter");
      await page.waitForTimeout(9000);
      return;
    }

    // Selecting Cards only matters when the card fields are not already on screen.
    if (!(await frame.locator('input[placeholder*="card number" i]').count().catch(() => 0))) {
      await frame.getByText(/^Cards?$/i).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    for (const [selector, value] of FIELDS) await type(frame, selector, value);

    await advance(frame);
    await page.waitForTimeout(3000);
  }

  throw new Error("never reached the OTP screen");
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
    if (!order.authorizationUrl || !(order.razorpayPaymentLinkId ?? order.razorpayOrderId)) {
      console.error(`${order.id}: no authorization url, skipping`);
      continue;
    }
    console.error(`${order.id} ${formatInr(order.amountPaise)} -> ${order.authorizationUrl}`);

    // VOUCH_RECORD=1 also writes a .webm of the walk. The trace proves it to an engineer; the
    // video proves it to everyone else, which is what a submission needs.
    const ctx = await browser.newContext(
      RECORD ? { recordVideo: { dir: "evidence/video", size: { width: 1280, height: 720 } } } : {},
    );
    // The trace is itself evidence: it shows a device, not a person, completing the payment.
    await ctx.tracing.start({ screenshots: true, snapshots: true });
    const page = await ctx.newPage();

    try {
      await authorize(page, order.authorizationUrl);
    } catch (error) {
      console.error(`   walk failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }

    await ctx.tracing.stop({ path: `evidence/device-${order.id}.zip` });
    const video = page.video();
    // Only final once the context closes, so the rename has to wait for it.
    await ctx.close();
    if (video) {
      const saved = `evidence/video/device-${order.id}.webm`;
      // Reported honestly rather than swallowed: a failed rename used to print a path that did not
      // exist, with the recording sitting beside it under Playwright's hashed name.
      try {
        await video.saveAs(saved);
        console.error(`   video ${saved}`);
      } catch {
        console.error(`   video ${await video.path()}`);
      }
    }

    // No webhook reached us here, so the receipt will say mode:"polled". Never claim a signature
    // we did not verify.
    const result = await confirmOrder(order.id);
    if (result.status === "PAID") {
      console.error(`   captured ${result.paymentId} -> ${result.alreadySettled ? "already settled" : `PAID, receipt ${result.receiptId}`}`);
    } else if (result.status === "FAILED") {
      console.error(`   not captured -> FAILED, released ${formatInr(BigInt(result.releasedPaise))}`);
    } else {
      console.error("   not captured, nothing attempted — leaving it pending");
    }
  }

  await browser.close();
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
