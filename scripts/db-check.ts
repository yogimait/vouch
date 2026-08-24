// You will confuse the pooled and direct URLs once. This makes that cost 5 seconds, not 40 minutes.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";

function describe(label: string, url: string | undefined) {
  if (!url) return console.error(`${label}: not set`);
  const { hostname, port } = new URL(url);
  const kind = port === "6543" ? "pooled (correct for the app)"
    : port === "5432" ? "direct (correct for migrations only)"
    : "unrecognised port";
  console.error(`${label}: ${hostname}:${port} — ${kind}`);
}

describe("DATABASE_URL", process.env.DATABASE_URL);
describe("DIRECT_URL", process.env.DIRECT_URL);

const [row] = (await getDb().execute(sql`select current_database() as db, version() as v`)) as unknown as Record<string, string>[];
console.error(`connected to ${row.db}`);
console.error(row.v.split(",")[0]);
process.exit(0);
