// Replaces `drizzle-kit migrate`, which exits 0 after a DNS failure without applying anything and
// without saying so. This throws. "Runs from a clean clone" depends on that.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Neither DIRECT_URL nor DATABASE_URL is set. Copy .env.example to .env.local.");
  process.exit(1);
}

const { hostname, port } = new URL(url);
if (port === "6543") {
  console.error(`Refusing to migrate over the transaction pooler (${hostname}:6543) — it cannot run DDL.`);
  console.error("Set DIRECT_URL to the Direct or Session-pooler string (port 5432).");
  process.exit(1);
}

console.error(`migrating via ${hostname}:${port}`);
// Postgres emits "already exists, skipping" NOTICEs on a re-run; they are not problems.
const client = postgres(url, { max: 1, prepare: false, connect_timeout: 20, onnotice: () => {} });

try {
  await migrate(drizzle(client), { migrationsFolder: "./src/core/db/migrations" });
  console.error("migrations applied");
} catch (error) {
  console.error("\nMIGRATION FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await client.end({ timeout: 5 }).catch(() => {});
}
