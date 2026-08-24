// Day-0 gate. Proves a payment can be created AND completed without a human.
// Nothing else gets built until this prints CAPTURED.
//
// Run:  npm run probe          (headless, tries to complete)
//       npm run probe -- --explore   (headed, stops at the payment page and dumps what it sees)
//
// Result: PASSES. Payment link -> embedded Checkout v2 -> contact gate -> domestic test card ->
// decline card-save -> Razorpay's own OTP screen (123456, submitted with Enter) -> captured.
// UPI is not an option here: GET /v1/preferences reports upi:false on this account.

import { chromium, type Frame, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const API = "https://api.razorpay.com/v1";
const EXPLORE = process.argv.includes("--explore");
const OUT = "evidence/probe";

if (!KEY_ID || !KEY_SECRET) {
  console.error("Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET. Put them in .env.local.");
  process.exit(1);
}
if (!KEY_ID.startsWith("rzp_test_")) {
  console.error(`Refusing to run against a non-test key: ${KEY_ID.slice(0, 12)}...`);
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");

async function rzp(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}\n${text}`);
  return JSON.parse(text);
}

interface PageInventory {
  url: string; title: string; iframes: string[];
  inputs: string[]; clickables: string[]; bodyText: string;
}

// Test-mode 3DS opens in a popup, so the button we need is never on the page we started with.
const popups: Page[] = [];

/** Which frame hosts the auth step is not stable, so search all of them rather than assume one. */
async function findFrame(page: Page, selector: string, tries = 12): Promise<Frame | null> {
  for (let i = 0; i < tries; i++) {
    for (const p of [page, ...popups.filter((x) => x !== page)]) {
      if (p.isClosed()) continue;
      for (const f of p.frames()) {
        if (await f.locator(selector).first().count().catch(() => 0)) return f;
      }
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

/** Polls every surface — page, popups, and their frames — because which one hosts 3DS varies. */
async function clickSuccess(page: Page): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const surfaces = [page, ...popups.filter((p) => p !== page)];
    if (i % 4 === 0) {
      const urls = surfaces.flatMap((p) => (p.isClosed() ? [] : p.frames().map((f) => f.url())));
      console.error(`   [3ds ${i}] ${urls.map((u) => u.slice(0, 70)).join("\n              ")}`);
    }
    for (const p of surfaces) {
      if (p.isClosed()) continue;
      for (const f of p.frames()) {
        const hit = f.locator('button:has-text("Success"), input[value="Success" i], a:has-text("Success")').first();
        if (await hit.count().catch(() => 0)) {
          await hit.click({ timeout: 5000 }).catch(() => {});
          console.error(`   clicked 3DS Success on ${f.url().slice(0, 60)}`);
          return true;
        }
      }
    }
    await page.waitForTimeout(1500);
  }
  return false;
}

// The link page is only a shell; the whole checkout is an iframe. Everything drivable is in there.
function checkout(page: Page): Frame {
  const frame = page.frames().find((f) => f.url().includes("/checkout/"));
  if (!frame) throw new Error("no checkout frame on the page");
  return frame;
}

// What the page offers us is the whole question, so record it rather than guessing.
async function dumpPage(page: Page, tag: string, scope?: Frame) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  // Passed as a string: tsx's esbuild injects a __name helper into function source, which does not
  // exist in the page. A string expression is never transpiled.
  const inventory = (await (scope ?? page).evaluate(`(() => {
    const seen = (sel) => [...document.querySelectorAll(sel)].map((e) => {
      const label = (e.getAttribute("aria-label") || e.getAttribute("placeholder") ||
        e.getAttribute("name") || e.getAttribute("id") || e.innerText || "").trim().slice(0, 80);
      return label ? e.tagName.toLowerCase() + " :: " + label : null;
    }).filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      iframes: [...document.querySelectorAll("iframe")].map((f) => f.getAttribute("src") || "(no src)"),
      inputs: seen("input, select, textarea"),
      clickables: seen("button, [role=button], a"),
      bodyText: document.body.innerText.slice(0, 3000),
    };
  })()`)) as PageInventory;
  writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(inventory, null, 2));
  console.error(`  dumped -> ${OUT}/${tag}.png  ${OUT}/${tag}.json`);
  return inventory;
}

async function main() {
  const stamp = Date.now();

  console.error("1. creating order");
  const order = await rzp("/orders", {
    amount: 100_00, // Rs 100.00 in paise
    currency: "INR",
    receipt: `probe_${stamp}`,
    notes: { probe: "day0" },
  });
  console.error(`   order ${order.id}`);

  console.error("2. creating payment link");
  const link = await rzp("/payment_links", {
    amount: 100_00,
    currency: "INR",
    description: "Vouch day-0 probe",
    reference_id: `probe_${stamp}`,
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { probe: "day0", order_id: String(order.id) },
  });
  console.error(`   link ${link.id} -> ${link.short_url}`);

  console.error("3. opening the hosted page");
  const browser = await chromium.launch({ headless: !EXPLORE });
  const ctx = await browser.newContext();
  ctx.on("page", (p) => popups.push(p));
  await ctx.tracing.start({ screenshots: true, snapshots: true });
  const page = await ctx.newPage();
  await page.goto(String(link.short_url), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000); // the widget mounts after load

  const frame = checkout(page);
  const seen = await dumpPage(page, "link-page", frame);
  console.error(`   ${seen.inputs.length} inputs, ${seen.clickables.length} clickables, ${seen.iframes.length} iframes`);

  if (EXPLORE) {
    console.error("\n--explore: browser left open for 5 minutes. Inspect, then Ctrl+C.");
    console.error("Look for: which frame hosts each step, and what the submit control is called.");
    await page.waitForTimeout(300_000);
    await ctx.tracing.stop({ path: `${OUT}/trace.zip` });
    await browser.close();
    return;
  }

  console.error("4. attempting card completion (domestic test card)");
  const completed = await tryCard(page);
  if (!completed) {
    await dumpPage(page, "link-page-stuck", checkout(page));
    console.error("   could not drive the page blind. Re-run with --explore and read the dump.");
  }

  console.error("5. confirming server-side");
  // Capture is not synchronous with the redirect, so poll rather than read once and call it failed.
  let after: Record<string, unknown> = {};
  for (let i = 0; i < 10; i++) {
    after = await rzp(`/payment_links/${link.id}`);
    if (after.status === "paid") break;
    await page.waitForTimeout(3000);
  }
  await ctx.tracing.stop({ path: `${OUT}/trace.zip` });
  await browser.close();

  const payments = (after.payments as unknown[] | undefined) ?? [];
  console.error(`   link status: ${after.status}, payments: ${payments.length}`);

  if (after.status === "paid") {
    console.log("\nCAPTURED");
    console.log(JSON.stringify({ orderId: order.id, linkId: link.id, payments }, null, 2));
    process.exit(0);
  }

  console.log("\nNOT CAPTURED — the gate is not passed.");
  console.log(`Read ${OUT}/link-page.json, then re-run with --explore.`);
  process.exit(1);
}

// Card, not UPI: GET /v1/preferences reports upi:false on this account, so the documented test VPAs
// are unreachable whatever page we drive. Checkout v2 also gates on contact details before showing
// any method, so this is a walk. Each step dumps — a failure two screens in is otherwise invisible.
async function tryCard(page: Page): Promise<boolean> {
  const step = async (tag: string, fn: (f: Frame) => Promise<void>) => {
    await fn(checkout(page));
    await page.waitForTimeout(2500);
    const seen = await dumpPage(page, tag, checkout(page));
    console.error(`   ${tag}: ${seen.inputs.join(" | ") || "no inputs"}`);
  };

  try {
    await step("step1-contact", async (f) => {
      // Typed, not filled: the validator listens per keystroke and rejects a programmatic set.
      const mobile = f.locator('input[placeholder*="obile" i], input[type="tel"]').first();
      await mobile.click();
      await mobile.pressSequentially("9123456789", { delay: 60 });
      await f.waitForTimeout(800);
      await f.getByRole("button", { name: /continue|proceed/i }).first().click();
    });

    await step("step2-methods", async (f) => {
      await f.getByText(/^Cards?$/i).first().click();
    });

    await step("step3-card", async (f) => {
      // Optional by design: name and email only render for some card types, and a hard wait on a
      // field that will never appear costs 30s and hides which field actually mattered.
      const type = async (sel: string, value: string) => {
        const input = f.locator(sel).first();
        try {
          await input.click({ timeout: 6000 });
          await input.pressSequentially(value, { delay: 40 });
        } catch {
          console.error(`   skipped absent field: ${sel}`);
        }
      };
      await type('input[placeholder*="card number" i]', "5267318187975449");
      await type('input[placeholder*="MM" i]', "1230");
      await type('input[placeholder*="CVV" i]', "123");
      // Name and email only render once the number is entered, and both are required.
      await type('input[placeholder*="name on card" i]', "Vouch Probe");
      await type('input[placeholder*="Email" i]', "probe@vouch.test");
    });

    await step("step4-submit", async (f) => {
      await f.getByRole("button", { name: /pay|proceed|continue/i }).first().click();
    });

    // A "save your card" interstitial sits between submit and 3DS. Declining is the demo-safe answer.
    const later = checkout(page).getByRole("button", { name: /maybe later|not now|skip/i }).first();
    if (await later.count()) {
      await later.click();
      console.error("   declined card save");
    }

    // Test mode serves Razorpay's own OTP screen rather than a bank page. The OTP is fixed.
    const otpFrame = await findFrame(page, 'input[placeholder*="OTP" i]');
    if (otpFrame) {
      const shown = await dumpPage(page, "step5-otp-form", otpFrame);
      console.error(`   otp frame buttons: ${shown.clickables.join(" | ")}`);
      const otp = otpFrame.locator('input[placeholder*="OTP" i]').first();
      await otp.click();
      await otp.pressSequentially("123456", { delay: 60 });
      // The submit button carries no accessible name, so Enter is the reliable way to submit.
      await otp.press("Enter");
      console.error("   submitted test OTP");
      await page.waitForTimeout(8000);
      await dumpPage(page, "step5-otp", checkout(page));
      return true;
    }

    if (!(await clickSuccess(page))) {
      console.error("   no 3DS Success button found; dumping");
      await dumpPage(page, "step5-3ds");
      for (const [i, p] of popups.entries()) await dumpPage(p, `step5-popup${i}`);
      return false;
    }
  } catch (err) {
    console.error(`   walk stopped: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    return false;
  }
  return true;
}

main().catch((err) => {
  console.error("\nPROBE FAILED");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
