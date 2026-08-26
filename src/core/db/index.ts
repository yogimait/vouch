// Lazy and cached on globalThis: importing this must not require DATABASE_URL at build time, and a
// serverless reload must not open a second pool.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/core/db/schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __vouchDb: Db | undefined;
}

export function getDb(): Db {
  if (globalThis.__vouchDb) return globalThis.__vouchDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");

  // prepare:false is mandatory on Supabase's transaction-mode pooler (port 6543).
  // Every console route issues three aggregates at once, so five connections deadlocked the moment
  // more than one page was in flight. The timeouts matter as much as the size: without them a
  // starved request waits forever and the browser shows a skeleton that never resolves.
  const client = postgres(url, {
    max: 12,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  globalThis.__vouchDb = drizzle(client, { schema });
  return globalThis.__vouchDb;
}

export { schema };
