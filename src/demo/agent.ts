// The buyer agent, streamed to the console as it runs.
//
// Server-sent events over a plain ReadableStream — no library. The model talks to the merchant over
// HTTP exactly as demo2 does; this file only watches. Nothing here can influence what it decides.
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/core/db";
import { newId } from "@/core/ids";
import { env } from "@/core/env";
import { authorizations, decisions, misquoteEvents } from "@/core/db/schema";
import { formatInr } from "@/core/money";
import { balances } from "@/core/ledger";
import { demoAgent, type DemoAgent } from "@/demo/agents";
import { DEMO_KEYS } from "@/core/db/seed";
import { runBuyer } from "@/agent/buyer";
import { DEFAULT_INSTRUCTION } from "@/demo/instructions";

export { DEFAULT_INSTRUCTION };


export interface Misquote {
  kind: string;
  claimed: string | null;
  signed: string | null;
  code: string | null;
  words: string | null;
}

export interface DecisionSummary {
  outcome: string;
  code: string | null;
  rule: string | null;
  observed: string | null;
  expected: string | null;
  message: string | null;
  latencyMs: number;
}

export interface Mandate {
  maxPaise: string;
  debitedPaise: string;
  heldPaise: string;
  availablePaise: string;
}

export function agentStream(instruction: string, who: DemoAgent = "shopbot"): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const since = new Date();
  // One namespace per run. The model writes deterministic idempotency keys, so two runs of the same
  // errand collided and the second replayed the first one's order instead of buying anything.
  const runId = newId("request");

  return new ReadableStream({
    async start(controller) {
      // The client can disconnect mid-errand -- a tab closing, or a reload.
      // Enqueueing after that throws "Controller is already closed", which used to escape into
      // the catch below and be filed as "the model call failed before reaching the guard". It
      // did not fail: the run finished and nobody was listening.
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      try {
        const agent = await demoAgent(who);
        send({
          type: "start", instruction, agent: agent.name,
          model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b", temperature: 0.7,
          mandate: await mandateFor(agent.id),
        });

        const run = await runBuyer({
          runId,
          baseUrl: env().APP_URL,
          apiKey: who === "frozen" ? DEMO_KEYS.frozen : (process.env.VOUCH_AGENT_KEY ?? DEMO_KEYS.shopbot),
          instruction,
          onStep: (step) => send({ type: "step", ...step }),
        });

        // The consequences, not just the transcript: what the guard ruled, and what it cost the
        // mandate. Reading them off another page is what made the old panel a demo of a demo.
        send({
          type: "done", text: run.text, orderId: run.orderId,
          misquotes: await misquotesSince(since),
          decisions: await decisionsSince(since, agent.id),
          mandate: await mandateFor(agent.id),
        });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      } finally {
        if (open) controller.close();
      }
    },
  });
}

/** Only rows this run produced, and only ones an LLM produced. Never mixed with harness rows. */
async function misquotesSince(since: Date): Promise<Misquote[]> {
  const rows = await getDb().select().from(misquoteEvents)
    .where(and(eq(misquoteEvents.source, "llm"), gt(misquoteEvents.createdAt, since)))
    .orderBy(misquoteEvents.createdAt);

  return rows.map((r) => ({
    kind: r.kind,
    claimed: r.claimedPaise === null ? null : formatInr(r.claimedPaise),
    signed: r.signedPaise === null ? null : formatInr(r.signedPaise),
    code: r.claimedDiscountCode,
    words: r.rawAgentText,
  }));
}

/** Every verdict this run produced, in order. A refusal never becomes an order, so this is the
 *  only place some of them exist. */
export async function decisionsSince(since: Date, agentId: string): Promise<DecisionSummary[]> {
  const rows = await getDb().select().from(decisions)
    .where(and(eq(decisions.agentId, agentId), gt(decisions.createdAt, since)))
    .orderBy(decisions.createdAt);

  return rows.map((r) => {
    const reason = (r.reasons as { code?: string; rule?: string; observed?: string; expected?: string; message?: string }[])[0];
    return {
      outcome: r.outcome,
      code: reason?.code ?? null,
      rule: reason?.rule ?? null,
      observed: reason?.observed ?? null,
      expected: reason?.expected ?? null,
      message: reason?.message ?? null,
      latencyMs: r.latencyMs,
    };
  });
}

export async function mandateFor(agentId: string): Promise<Mandate | null> {
  const [auth] = await getDb().select().from(authorizations)
    .where(and(eq(authorizations.agentId, agentId), eq(authorizations.status, "confirmed"))).limit(1);
  if (!auth) return null;

  const b = await balances(auth.id, auth.maxAmountPaise);
  return {
    maxPaise: auth.maxAmountPaise.toString(),
    debitedPaise: b.debitedPaise.toString(),
    heldPaise: b.heldPaise.toString(),
    availablePaise: b.availablePaise.toString(),
  };
}
