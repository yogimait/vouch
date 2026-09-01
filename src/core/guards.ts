// Route-handler plumbing. Keeps every route at the 12-line ceiling.
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ZodType } from "zod";
import { getDb } from "@/core/db";
import { buyerAgents } from "@/core/db/schema";
import { fail } from "@/core/http";
import { take } from "@/core/limit";

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

  // Rate limited per agent, here rather than per route, because every authenticated surface goes
  // through this function and the routes are at a 12-line ceiling.
  //
  // Not the same thing as the engine's maxOrdersPerHour: that is a policy rule, it counts rows that
  // became ORDERS, and it is evaluated after signature verification and a dozen reads. It therefore
  // does nothing about quote flooding, which is the cheap way to hurt this deployment -- every quote
  // writes an offer AND an audit row, and the audit chain takes one global lock.
  const limit = take(`agent:${agent.id}`, CALLS_PER_MINUTE, 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      response: fail("RATE_LIMITED", { retryAfterSeconds: limit.retryAfter }),
    };
  }

  // Freezing an agent has to stop it here, not at the last step. AGENT_FROZEN is rule 1 of the
  // engine, which only runs on pay -- so a frozen agent could still browse the catalogue and, worse,
  // have the merchant sign it a fresh offer token. Revocation that only takes effect on the final
  // call is not revocation. The engine rule stays where it is, as the second lock.
  if (agent.status === "FROZEN") {
    return { ok: false, response: fail("AGENT_FROZEN", { agentId: agent.id, reason: agent.frozenReason }) };
  }

  return { ok: true, value: agent };
}

/**
 * The scheduler's own bearer. Nothing about it is an agent, so it does not go through requireAgent:
 * there is no row to look up and no decision to label. An unset CRON_SECRET refuses every call.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Generous on purpose: a demo drives dozens of calls in a burst and must never trip this, while a
 * loop fast enough to serialise the audit chain trips it immediately. It is a speed bump, and
 * core/limit.ts is honest about being per-instance.
 */
const CALLS_PER_MINUTE = 120;

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
