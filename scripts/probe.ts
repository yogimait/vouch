// Day-0 gate. Proves a payment can be created AND completed without a human.
// Nothing else gets built until this prints CAPTURED.
//
// Run:  npm run probe          (headless, tries to complete)
//       npm run probe -- --explore   (headed, stops at the payment page and dumps what it sees)
//
// Razorpay only documents the test VPAs "on Checkout" and says nothing about hosted Payment Link
// pages, so this tries the link page first and reports exactly what it finds rather than assuming.

import { chromium, type Page } from "playwright";
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

// What the page offers us is the whole question, so record it rather than guessing.
async function dumpPage(page: Page, tag: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  const inventory = await page.evaluate(() => {
    const seen = (sel: string) =>
      [...document.querySelectorAll(sel)]
        .map((el) => {
          const e = el as HTMLElement;
          const label = (e.getAttribute("aria-label") || e.getAttribute("placeholder") ||
            e.getAttribute("name") || e.getAttribute("id") || e.innerText || "").trim().slice(0, 80);
          return label ? `${el.tagName.toLowerCase()} :: ${label}` : null;
        })
        .filter(Boolean);
    return {
      url: location.href,
      title: document.title,
      iframes: [...document.querySelectorAll("iframe")].map((f) => f.getAttribute("src") || "(no src)"),
      inputs: seen("input, select, textarea"),
      clickables: seen("button, [role=button], a"),
      bodyText: document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 3000),
    };
  });
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
  await ctx.tracing.start({ screenshots: true, snapshots: true });
  const page = await ctx.newPage();
  await page.goto(String(link.short_url), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000); // the widget mounts after load

  const seen = await dumpPage(page, "link-page");
  console.error(`   ${seen.inputs.length} inputs, ${seen.clickables.length} clickables, ${seen.iframes.length} iframes`);

  if (EXPLORE) {
    console.error("\n--explore: browser left open for 5 minutes. Inspect, then Ctrl+C.");
    console.error("Look for: how UPI is selected, and whether the VPA field is in an iframe.");
    await page.waitForTimeout(300_000);
    await ctx.tracing.stop({ path: `${OUT}/trace.zip` });
    await browser.close();
    return;
  }

  console.error("4. attempting UPI completion with success@razorpay");
  const completed = await tryUpi(page);
  if (!completed) {
    await dumpPage(page, "link-page-stuck");
    console.error("   could not drive the page blind. Re-run with --explore and read the dump.");
  }

  await page.waitForTimeout(6000);
  await ctx.tracing.stop({ path: `${OUT}/trace.zip` });
  await browser.close();

  console.error("5. confirming server-side");
  const after = await rzp(`/payment_links/${link.id}`);
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

// Blind first attempt. Failure here is expected and informative, not fatal.
async function tryUpi(page: Page): Promise<boolean> {
  const upiTrigger = page.getByText(/UPI/i).first();
  try {
    await upiTrigger.click({ timeout: 8000 });
    await page.waitForTimeout(1500);
  } catch {
    console.error("   no UPI option found at the top level");
    return false;
  }

  const vpa = page.locator('input[placeholder*="UPI" i], input[name*="vpa" i], input[placeholder*="@" i]').first();
  try {
    await vpa.fill("success@razorpay", { timeout: 8000 });
  } catch {
    console.error("   UPI selected but no VPA input reachable (likely inside an iframe)");
    return false;
  }

  const submit = page.getByRole("button", { name: /pay|verify|proceed|continue/i }).first();
  try {
    await submit.click({ timeout: 8000 });
  } catch {
    console.error("   VPA filled but no submit button found");
    return false;
  }
  return true;
}

main().catch((err) => {
  console.error("\nPROBE FAILED");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
