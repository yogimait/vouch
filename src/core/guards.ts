// Route-handler plumbing. Keeps every route at the 12-line ceiling.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ZodType } from "zod";
import { getDb } from "@/core/db";
import { buyerAgents } from "@/core/db/schema";
import { fail } from "@/core/http";

export type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

/**
 * Generic over the SCHEMA, not its output type: inferring from the input side makes every field
 * with a .default() look possibly-undefined at the call site.
 */
export async function parseBody<S extends ZodType>(request: Request, schema: S): Promise<Parsed<S["_output"]>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail("INVALID_REQUEST", { reason: "body is not JSON" }) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return { ok: false, response: fail("INVALID_REQUEST", { issues }) };
  }
  return { ok: true, value: result.data };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type AgentRow = typeof buyerAgents.$inferSelect;

/** Resolves the caller from the Bearer key. The same key authenticates HTTP and MCP. */
export async function requireAgent(request: Request): Promise<Parsed<AgentRow>> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) return { ok: false, response: fail("AGENT_UNKNOWN", { reason: "missing bearer token" }) };

  const [agent] = await getDb().select().from(buyerAgents).where(eq(buyerAgents.apiKeyHash, hashApiKey(key))).limit(1);
  if (!agent) return { ok: false, response: fail("AGENT_UNKNOWN") };
  return { ok: true, value: agent };
}

/** Any throw becomes a valid envelope rather than an HTML error page. */
export async function handle(what: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error(`[${what}]`, error);
    return fail("GUARD_UNAVAILABLE", { operation: what });
  }
}
