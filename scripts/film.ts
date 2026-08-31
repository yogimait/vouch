// Films the product working. One take, no cuts, nothing staged.
//
//   npm run dev     (in another terminal)
//   npm run film    writes evidence/video/vouch-<stamp>.webm
//
// The console is recorded from a seeded, empty state, then the restock run and the authorization
// device are started as real child processes while the browser keeps watching. The pages change
// because the system changed, not because a script advanced a slideshow — which is the only reason
// to film a dashboard at all.
//
// Deliberately points the browser at localhost rather than APP_URL: the deployment may be a commit
// behind, and a film of stale code is worse than no film.
import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const SITE = "http://localhost:3000";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** Long enough to read, short enough to keep. Every pause is a caption someone has to sit through. */
const BEAT = 3_500;

function run(script: string, args: string[] = []) {
  return spawn("npx", ["tsx", "--env-file=.env.local", script, ...args], {
    stdio: "inherit", shell: process.platform === "win32",
  });
}

function finished(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => child.on("close", (code) => resolve(code ?? 0)));
}

async function show(page: Page, path: string, hold = BEAT): Promise<void> {
  await page.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(hold);
}

/**
 * Reloads one page on a timer until the child process exits. This is the part that makes the film
 * worth recording: the numbers move while an agent is actually spending, rather than after.
 */
async function watchWhile(page: Page, path: string, child: ReturnType<typeof spawn>): Promise<void> {
  let running = true;
  const done = finished(child).then((code) => { running = false; return code; });
  while (running) {
    await page.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(4_000);
  }
  await done;
}

async function main(): Promise<void> {
  mkdirSync("evidence/video", { recursive: true });

  // Seeded first, and awaited: filming a half-spent mandate would show the escalate arriving early
  // for a reason the film never explains.
  console.error("seeding…");
  await finished(run("scripts/seed.ts"));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: "evidence/video", size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();

  console.error("filming: the console, at rest");
  await show(page, "/agent");
  await show(page, "/authorizations");
  await show(page, "/decisions");

  console.error("filming: the restock run, live");
  await watchWhile(page, "/decisions", run("scripts/restock.ts"));

  console.error("filming: what the run produced");
  await show(page, "/decisions", 6_000);
  await show(page, "/authorizations", 5_000);
  await show(page, "/misquotes");

  console.error("filming: the device settling the queue, live");
  await watchWhile(page, "/receipts", run("scripts/device.ts"));

  console.error("filming: the receipts");
  await show(page, "/receipts", 5_000);

  // The receipt page is the product's argument, so it gets the longest hold in the film.
  const href = await page.locator('a[href^="/receipts/ord_"]').first().getAttribute("href").catch(() => null);
  if (href) await show(page, href, 12_000);

  await show(page, "/metrics", 6_000);

  const video = page.video();
  // Only final once the context closes, so the rename has to wait for it.
  await ctx.close();
  await browser.close();

  if (!video) throw new Error("no video was recorded");
  const out = `evidence/video/vouch-${stamp}.webm`;
  try {
    await video.saveAs(out);
    console.error(`\n  ${out}`);
  } catch (error) {
    // Never swallowed: a silent saveAs failure once printed a filename that did not exist while the
    // recording sat next to it under Playwright's own hashed name. Report the real path instead.
    console.error(`\n  could not rename — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    console.error(`  the recording is at ${await video.path()}`);
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
