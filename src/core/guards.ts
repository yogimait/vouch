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

/** The same key authenticates HTTP and MCP, so lookup lives in one place for both. */
export async function agentByKey(key: string): Promise<AgentRow | null> {
  if (!key) return null;
  const [agent] = await getDb().select().from(buyerAgents)
    .where(eq(buyerAgents.apiKeyHash, hashApiKey(key))).limit(1);
  return agent ?? null;
}

export async function requireAgent(request: Request): Promise<Parsed<AgentRow>> {
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) return { ok: false, response: fail("AGENT_UNKNOWN", { reason: "missing bearer token" }) };

  const agent = await agentByKey(key);
  if (!agent) return { ok: false, response: fail("AGENT_UNKNOWN") };
  return { ok: true, value: agent };
}

const SOURCES = ["mcp", "http", "llm", "harness"] as const;
export type RequestSource = (typeof SOURCES)[number];

/**
 * Labels a decision row for reporting only — it never reaches a rule, so a caller lying about it
 * changes no outcome. It exists so LLM-driven and harness numbers are never summed by accident.
 */
export function sourceFrom(request: Request): RequestSource {
  const claimed = request.headers.get("x-vouch-source") ?? "";
  return (SOURCES as readonly string[]).includes(claimed) ? (claimed as RequestSource) : "http";
}

/** Auth and body in one step, because doing them separately is four lines in every route. */
export async function agentRequest<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<Parsed<{ caller: AgentRow; body: S["_output"] }>> {
  const caller = await requireAgent(request);
  if (!caller.ok) return caller;
  const body = await parseBody(request, schema);
  if (!body.ok) return body;
  return { ok: true, value: { caller: caller.value, body: body.value } };
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
