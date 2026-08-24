// You will mix up the pooled and direct URLs once. This makes that cost 5 seconds, not 40 minutes.
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "@/core/db";

interface Parsed { host: string; port: string; pooled: boolean }

function parse(url: string): Parsed {
  const { hostname, port } = new URL(url);
  return { host: hostname, port: port || "5432", pooled: hostname.includes("pooler.supabase.com") };
}

const problems: string[] = [];

const appUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;

if (!appUrl) {
  problems.push("DATABASE_URL is not set.");
} else {
  const a = parse(appUrl);
  console.error(`DATABASE_URL  ${a.host}:${a.port}`);
  if (a.port !== "6543") {
    problems.push(`DATABASE_URL should be the POOLED string on port 6543, got ${a.port}. Supabase -> Connect -> ORM -> Drizzle.`);
  }
}

if (!directUrl) {
  problems.push("DIRECT_URL is not set. Migrations will fall back to DATABASE_URL and fail on the pooler.");
} else {
  const d = parse(directUrl);
  const kind = d.pooled ? "session pooler (fine for migrations)" : "direct";
  console.error(`DIRECT_URL    ${d.host}:${d.port}  — ${kind}`);
  if (d.port === "6543") {
    problems.push("DIRECT_URL is the transaction pooler (6543). It cannot run DDL. Use the Direct tab, or the Session pooler on 5432.");
  }
}

if (appUrl && directUrl && appUrl === directUrl) {
  problems.push("DATABASE_URL and DIRECT_URL are identical. They are two different strings.");
}

// The first version of this check never connected with DIRECT_URL, so it passed green while the
// direct host did not resolve at all. A check that does not exercise the thing is not a check.
if (directUrl) {
  const probe = postgres(directUrl, { max: 1, prepare: false, connect_timeout: 12 });
  try {
    await probe`select 1`;
    console.error("DIRECT_URL    reachable");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    problems.push(`DIRECT_URL is unreachable: ${reason}`);
    if (reason.includes("ENOTFOUND")) {
      problems.push("That host does not resolve. Supabase no longer provisions db.<ref>.supabase.co on every project — use the SESSION POOLER string (pooler host, port 5432).");
    }
  } finally {
    await probe.end({ timeout: 5 }).catch(() => {});
  }
}

if (problems.length) {
  console.error("");
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

const [row] = (await getDb().execute(
  sql`select current_database() as db, current_user as usr, version() as v`,
)) as unknown as Record<string, string>[];

console.error(`\nconnected: ${row.db} as ${row.usr}`);
console.error(row.v.split(",")[0]);
process.exit(0);
