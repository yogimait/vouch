// The floor: the buyer's cupboard empties, and crossing a reorder level raises an errand.
//
// Staff usage is the only simulated thing in this file. What happens next — the offer, the guard,
// the money, the receipt — is the same code path an agent reaches over HTTP.
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/core/db";
import { purchaseRequests } from "@/core/db/schema";
import { newId } from "@/core/ids";
import { runBuyer } from "@/agent/buyer";
import { demoAgent } from "@/demo/agents";
import { decisionsSince } from "@/demo/agent";
import { DEMO_KEYS } from "@/core/db/seed";
import { formatInr } from "@/core/money";

export interface Shelf {
  id: string;
  name: string;
  onHand: number;
  startOnHand: number;
  reorderLevel: number;
  below: boolean;
}

export interface WarehouseLine {
  sku: string;
  name: string;
  onHand: number;
  /** Units on orders the guard admitted but nobody has paid for yet. Moves the instant it admits. */
  committed: number;
}

export interface RequestRow {
  id: string;
  source: "REORDER" | "STAFF";
  raisedBy: string;
  need: string;
  status: "OPEN" | "RUNNING" | "CLOSED";
  outcome: "ADMIT" | "ESCALATE" | "REFUSE" | null;
  words: string | null;
  orderId: string | null;
}

export interface OpsView {
  cupboard: Shelf[];
  warehouse: WarehouseLine[];
  /** The newest SHOWN. `raised` is the real total — the card must never report a page size. */
  requests: RequestRow[];
  raised: number;
  answered: number;
  mandateLeft: string | null;
}

/** Newest twelve. The queue is a story, not a ledger — /decisions is where the whole record lives. */
const SHOWN = 12;

/**
 * One tick of the working day. Sequential, never Promise.all: each statement holds a pooled
 * connection and this is the highest-frequency caller in the app.
 */
export async function opsTick(): Promise<OpsView> {
  const db = getDb();

  // One statement, returning the state it just produced — so deciding what crossed costs no second
  // read. Never read-then-write: two overlapping ticks would both read the same number and one
  // decrement would vanish.
  //
  // Consumption stops AT the reorder line, not at zero. The line is safety stock: a floor holds it
  // back once it has raised an order rather than issuing the last of it. Draining past it left every
  // shelf flat at zero, which read as a broken simulation rather than a cupboard waiting on delivery.
  const shelves = (await db.execute(sql`
    update cupboard_items
       set on_hand = greatest(on_hand - usage_per_tick, reorder_level)
     where on_hand > reorder_level
    returning id, need, on_hand, reorder_level
  `)) as unknown as { id: string; need: string; on_hand: number; reorder_level: number }[];

  const crossed = shelves.filter((s) => s.on_hand <= s.reorder_level);
  if (crossed.length > 0) {
    const blocked = await shelvesAlreadyAsking(crossed.map((s) => s.id));
    const asking = crossed.filter((s) => !blocked.has(s.id));

    if (asking.length > 0) {
      // requests_open_item_unique is the race backstop, not the rule: the rule is above, because an
      // index can only see rows that are still open.
      await db.insert(purchaseRequests).values(asking.map((s) => ({
        id: newId("request"),
        source: "REORDER" as const,
        cupboardItemId: s.id,
        raisedBy: "cupboard",
        need: s.need,
      }))).onConflictDoNothing();
    }
  }

  return opsOverview();
}

/**
 * A shelf asks once and then waits for an answer, so the floor cannot spin.
 *
 * Blocked while an errand is still in flight, and blocked for good once one came back as anything
 * other than goods on their way. Without the second half a refused or failed errand freed the shelf
 * the moment it closed, and since the shelf was still empty the next tick asked again — which
 * emptied the cupboard, filled the queue and ran the model until the API cut us off.
 */
async function shelvesAlreadyAsking(ids: string[]): Promise<Set<string>> {
  const rows = (await getDb().execute(sql`
    select distinct cupboard_item_id as id
      from purchase_requests
     where cupboard_item_id = any(${sql.param(ids)}::text[])
       and (status <> 'CLOSED' or outcome is null or outcome not in ('ADMIT', 'ESCALATE'))
  `)) as unknown as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

/** One round trip. Four questions, four json subqueries — the idiom the overview layer already uses. */
export async function opsOverview(): Promise<OpsView> {
  const rows = (await getDb().execute(sql`
    select
      (select coalesce(json_agg(json_build_object(
                'id', id, 'name', name, 'onHand', on_hand,
                'startOnHand', start_on_hand, 'reorderLevel', reorder_level,
                'below', on_hand <= reorder_level) order by created_at, id), '[]')::text
         from cupboard_items) as cupboard,

      (select coalesce(json_agg(json_build_object(
                'sku', c.sku, 'name', c.name, 'onHand', c.inventory,
                'committed', coalesce(k.n, 0)) order by c.sku), '[]')::text
         from catalog_items c
         left join (
           select o.sku, sum(o.qty)::int as n
             from orders ord
             join offers o on o.id = ord.offer_id
            where ord.state in ('ADMITTED', 'AWAITING_AUTHORIZATION', 'ESCALATED')
            group by o.sku
         ) k on k.sku = c.sku
        where c.active) as warehouse,

      (select coalesce(json_agg(r order by r.created_at desc), '[]')::text
         from (
           select id, source, raised_by as "raisedBy", need, status, outcome, words,
                  order_id as "orderId", created_at
             from purchase_requests
            order by created_at desc
            limit ${SHOWN}
         ) r) as requests,

      (select count(*)::text from purchase_requests) as raised,
      (select count(*)::text from purchase_requests where outcome is not null) as answered,

      (select a.max_amount_paise
              - coalesce(sum(l.amount_paise) filter (where l.entry_type = 'COMMIT'), 0)
              - (coalesce(sum(l.amount_paise) filter (where l.entry_type = 'RESERVE'), 0)
                 - coalesce(sum(l.amount_paise) filter (where l.entry_type = 'COMMIT'), 0)
                 - coalesce(sum(l.amount_paise) filter (where l.entry_type = 'RELEASE'), 0))
         from authorizations a
         join buyer_agents ag on ag.id = a.agent_id
         left join authorization_ledger l on l.authorization_id = a.id
        -- The ACTIVE agent's mandate, not whichever row sorted first. Both seeded authorizations
        -- carry the same created_at, so ordering alone kept returning the frozen agent's untouched
        -- Rs 9,000 and the number never moved.
        where a.status = 'confirmed' and a.revoked_at is null and ag.status = 'ACTIVE'
        group by a.id, a.created_at
        order by a.created_at
        limit 1)::text as mandate_left
  `)) as unknown as Record<string, string | null>[];

  const row = rows[0];
  return {
    cupboard: JSON.parse(String(row.cupboard)) as Shelf[],
    warehouse: JSON.parse(String(row.warehouse)) as WarehouseLine[],
    requests: JSON.parse(String(row.requests)) as RequestRow[],
    raised: Number(row.raised),
    answered: Number(row.answered),
    // Read as text and re-parsed: the driver must never round a money value into a float.
    mandateLeft: row.mandate_left === null ? null : formatInr(BigInt(String(row.mandate_left))),
  };
}

export const StaffRequest = z.object({
  need: z.string().trim().min(8).max(400),
  raisedBy: z.string().trim().min(1).max(120).default("person:asha@northwind.example"),
});

/**
 * The other way an errand starts: a person asks for something the cupboard has no shelf for. It
 * joins the same queue and meets the same guard — a request with a name on it is a business action,
 * which is what the free-text box on /agent is not.
 */
export async function fileRequest(input: z.infer<typeof StaffRequest>): Promise<OpsView> {
  await getDb().insert(purchaseRequests).values({
    id: newId("request"),
    source: "STAFF",
    raisedBy: input.raisedBy,
    need: input.need,
  });
  return opsOverview();
}

/**
 * The database's clock, never this machine's. runBuyer reaches the merchant at APP_URL, which may
 * be another host; a local timestamp running ahead of the row silently drops the decision.
 */
async function dbNow(): Promise<Date> {
  const rows = (await getDb().execute(sql`select now() as t`)) as unknown as { t: string | Date }[];
  return new Date(rows[0].t);
}

/**
 * The delivery arrives, so the shelf goes back up — but only when something is actually coming.
 * A refusal delivers nothing, and refilling on one would draw a cupboard that restocks itself out
 * of orders the merchant declined.
 */
async function refillShelfFor(requestId: string): Promise<void> {
  await getDb().execute(sql`
    update cupboard_items c
       set on_hand = c.start_on_hand
      from purchase_requests r
     where r.id = ${requestId} and r.cupboard_item_id = c.id
       and r.outcome in ('ADMIT', 'ESCALATE')
  `);
}

/**
 * One errand, streamed as it happens. The model is given the need in the buyer's own words and finds
 * the item itself; everything after that is the ordinary HTTP surface, so the guard cannot tell this
 * apart from any other agent and no LLM output reaches the decision.
 */
export function opsStream(requestId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const db = getDb();
        // Claiming is the guard against two runs on one errand. Zero rows means somebody already has
        // it — a check-then-run would race the next tick and pay the model twice.
        const claimed = (await db.execute(sql`
          update purchase_requests set status = 'RUNNING'
           where id = ${requestId} and status = 'OPEN'
          returning need
        `)) as unknown as { need: string }[];

        if (claimed.length === 0) {
          send({ type: "error", message: "that errand is already being run" });
          return;
        }

        const need = claimed[0].need;
        const agent = await demoAgent("shopbot");
        const since = await dbNow();
        send({ type: "start", requestId, need, agent: agent.name });

        const run = await runBuyer({
          baseUrl: process.env.APP_URL ?? "http://localhost:3000",
          apiKey: process.env.VOUCH_AGENT_KEY ?? DEMO_KEYS.shopbot,
          instruction: need,
          onStep: (step) => send({ type: "step", ...step }),
        });

        // A quote-time refusal writes no decision at all, so there may be nothing here. That is an
        // outcome — the merchant would not price it — and inventing one would claim the engine ruled.
        const verdicts = await decisionsSince(since, agent.id);
        const last = verdicts[verdicts.length - 1] ?? null;

        await db.execute(sql`
          update purchase_requests
             set status = 'CLOSED', closed_at = now(),
                 outcome = ${last?.outcome ?? null}, words = ${run.text.slice(0, 2000)},
                 order_id = ${run.orderId}
           where id = ${requestId}
        `);
        await refillShelfFor(requestId);

        send({ type: "done", outcome: last?.outcome ?? null, code: last?.code ?? null,
               rule: last?.rule ?? null, words: run.text, view: await opsOverview() });
      } catch (error) {
        // Closed with no outcome, deliberately. A guard that gets credit for an API timeout is
        // measuring nothing, so a model failure must never be filed as a refusal.
        const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
        await getDb().execute(sql`
          update purchase_requests
             set status = 'CLOSED', closed_at = now(), words = ${`the model call failed before reaching the guard — ${message}`}
           where id = ${requestId}
        `).catch(() => {});
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Re-arms the floor between takes. Deliberately NOT seed() — that truncates fourteen tables and
 * would destroy the receipts and the audit chain the rest of the demo is evidence for.
 */
export async function resetOps(): Promise<OpsView> {
  const db = getDb();
  await db.execute(sql`delete from purchase_requests`);
  await db.execute(sql`update cupboard_items set on_hand = start_on_hand`);
  return opsOverview();
}
