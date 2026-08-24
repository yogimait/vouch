// drizzle-kit reads .env, Next reads .env.local. This reconciles them without a dotenv dependency.
try { process.loadEnvFile(".env.local"); } catch { /* CI supplies the URL directly */ }

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/core/db/schema.ts",
  out: "./src/core/db/migrations",
  dialect: "postgresql",
  // Migrations must use the DIRECT connection (port 5432). The pooled one (6543) cannot run DDL.
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
