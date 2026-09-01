// Demo 5, as something a judge can run rather than watch.
//
//   npm run receipt export <orderId>     writes evidence/receipt-<orderId>.json
//   npm run receipt verify <file>        verifies it with nothing but the file
//   npm run receipt tamper <file> <path> <value>    edits one field and re-verifies
//   npm run receipt backfill             issues one for every PAID order that somehow has none
//
// The bundle carries the public key, so verify needs no database, no keys and no network.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { canonicalJson } from "@/core/canonical";
import { getDb } from "@/core/db";
import { issueReceipt } from "@/core/receipts/build";
import { verifyBundle, verifyStored, type Bundle, type Verification } from "@/core/receipts/verify";

const [mode, arg, path, value] = process.argv.slice(2);

function report(v: Verification): void {
  const mark = v.valid ? "VALID" : "INVALID";
  console.log(`\n  receipt          ${mark}`);
  console.log(`  signature        ${v.signatureValid ? "ok" : "FAILED"}`);
  console.log(`  tampered blocks  ${v.tamperedBlocks.length ? v.tamperedBlocks.join(", ") : "none"}`);
  if (v.chain) console.log(`  audit chain      ${v.chain.valid ? `ok (${v.chain.rowsChecked} rows)` : `BROKEN at ${v.chain.brokenAt}`}`);
  if (v.malformed) console.log("  body             MALFORMED");
  console.log();
}

function read(file: string): Bundle {
  return JSON.parse(readFileSync(file, "utf8")) as Bundle;
}

/** Walks a dotted path so the demo can name any field without a flag per block. */
function setAt(body: Record<string, unknown>, dotted: string, next: string): void {
  const keys = dotted.split(".");
  let node = body;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys.at(-1)!] = next;
}

async function main(): Promise<void> {
  if (mode === "export") {
    const loaded = await verifyStored(arg);
    if (!loaded.ok) throw new Error(`${loaded.code}: ${arg}`);

    mkdirSync("evidence", { recursive: true });
    const file = `evidence/receipt-${arg}.json`;
    writeFileSync(file, JSON.stringify(loaded.bundle, null, 2));
    console.log(`wrote ${file}`);
    report(loaded.verification);
    return;
  }

  // Reading a receipt already repairs a missing one (core/receipts/verify.ts loadRow). This is the
  // sweep for orders nobody has opened yet -- it exists so "every paid order emits a receipt" can be
  // checked as a statement about the whole table rather than one order at a time.
  if (mode === "backfill") {
    const rows = (await getDb().execute(sql`
      select o.id from orders o
       where o.state = 'PAID'
         and not exists (select 1 from receipts r where r.order_id = o.id)
       order by o.created_at
    `)) as unknown as { id: string }[];

    console.log(`
  ${rows.length} paid order${rows.length === 1 ? "" : "s"} with no receipt
`);
    let issued = 0;
    for (const row of rows) {
      const result = await issueReceipt(row.id);
      console.log(`  ${row.id}  ${result.ok ? `issued ${result.receiptId}` : `FAILED ${result.code}`}`);
      if (result.ok) issued += 1;
    }
    if (rows.length > 0) console.log(`
  issued ${issued} of ${rows.length}
`);
    return;
  }

  if (mode === "verify") {
    report(verifyBundle(read(arg)));
    return;
  }

  if (mode === "tamper") {
    const bundle = read(arg);
    const body = JSON.parse(bundle.receipt) as Record<string, unknown>;
    setAt(body, path, value);

    const edited = { ...bundle, receipt: canonicalJson(body) };
    const file = arg.replace(/\.json$/, ".tampered.json");
    writeFileSync(file, JSON.stringify(edited, null, 2));

    console.log(`edited ${path} -> ${value}`);
    console.log(`wrote ${file}`);
    report(verifyBundle(edited));
    return;
  }

  console.error("usage: receipt export <orderId> | verify <file> | tamper <file> <dotted.path> <value> | backfill");
  process.exit(1);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

