// The restock run: a customer's supplies run low, their procurement agent comes to our catalogue,
// and the guard answers. Nobody types anything after the command.
//
//   npm run dev        (in another terminal)
//   npm run db:seed    (the mandate funds three mice — re-seed before every take)
//   npm run restock
//   npm run device     (settles everything the run admitted, in one pass)
//
// We are the warehouse. The agent belongs to the buyer, holds an API key and no payment credential,
// and cannot import the guard — that is an ESLint rule.
//
// The agent is never told which SKU to buy. It is told what the business needs and finds the item
// itself: an agent handed a part number is a form, not an agent. Neither the errand text nor the
// tool names are printed — what belongs on screen is the need, the agent's own account of what it
// did, and the guard's answer. The plumbing is in the trace for anyone who wants it.
//
// The mandate drains as the run proceeds, so situations 4 and 5 differ only in what is left, not in
// what was asked. That is the whole argument for three outcomes instead of allow/deny.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { balances } from "@/core/ledger";
import { formatInr } from "@/core/money";
import { runBuyer } from "@/agent/buyer";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const KEY = process.env.VOUCH_AGENT_KEY ?? "vouch_sk_demo_shopbot";

type Outcome = "ADMIT" | "ESCALATE" | "REFUSE";

// Stock is checked twice, by two different components, and a request can be stopped at either.
// QUOTE_REFUSED is the merchant declining to price something it cannot ship (offers/issue.ts:40);
// the engine's catalog.inventory rule is the second gate, for stock that ran out after the offer
// was signed. Neither makes the other redundant — that is the point of having both.
type Stopped = Outcome | "QUOTE_REFUSED";

interface Situation {
  /** What happened in the buyer's business. */
  what: string;
  /** What the agent is about to do about it, and why. Printed before it acts. */
  intent: string;
  /** Sent to the model. Never printed — the demo is not a prompt being read aloud. */
  errand: string;
  expect: Stopped;
  /** Why it stops where it stops, in the buyer's language rather than the engine's. */
  because: string;
}

// Data, not logic — the story is tuned here without touching anything below.
//
// Order matters and is constrained by the engine, not by taste: RULES is walked top-down and stops
// at the first failure, with catalog.inventory LAST. So the stock case has to arise while the
// mandate still has headroom, or it would be stopped on budget first and never reach stock at all.
const SITUATIONS: Situation[] = [
  {
    what: "An ergonomics review flagged a desk on the main floor.",
    intent: "find a vertical mouse in our catalogue and buy one — it has not been told which item that is",
    errand: "The ergonomics review flagged a desk on the main floor: that person needs a vertical mouse. Order one.",
    expect: "ADMIT", because: "in scope, in stock, inside the mandate",
  },
  {
    what: "A second desk was flagged in the same review.",
    intent: "buy another of the same item — nothing about the request has changed",
    errand: "A second desk was flagged in the same ergonomics review. Order a vertical mouse for them too.",
    expect: "ADMIT", because: "still inside the mandate",
  },
  {
    what: "The podcast room records on Friday and has no pop filters.",
    intent: "try to buy five — we hold two, so this never becomes a priced offer",
    errand: "The podcast room records on Friday and has no pop filters at all. We need five of them.",
    expect: "QUOTE_REFUSED", because: "we cannot ship five of something we have two of",
  },
  {
    what: "A new starter joins Monday with a wrist-strain accommodation.",
    intent: "buy them the same vertical mouse — this is the last one the mandate covers",
    errand: "A new starter joins Monday with a documented wrist-strain accommodation. Get them a vertical mouse.",
    expect: "ADMIT", because: "the last order the remaining budget covers",
  },
  {
    what: "A second starter was added late, with the same accommodation.",
    intent: "buy an identical mouse — the same request as before, but the budget is now spent",
    errand: "A second starter was added late with the same accommodation. Order their vertical mouse as well.",
    expect: "ESCALATE", because: "legitimate, but past what this agent was funded for",
  },
  {
    what: "Facilities want a task chair for that desk.",
    intent: "try to buy furniture — nobody ever delegated furniture to this agent",
    errand: "Facilities want a proper task chair for the new starter's desk. Please order one.",
    expect: "REFUSE", because: "outside the delegated scope, at any price",
  },
];

interface DecisionRow {
  outcome: Outcome;
  reasons: { code: string; rule?: string; observed?: string; expected?: string | string[] }[];
  authorization_id: string | null;
}

/**
 * The database's clock, not this machine's. The API may be running on another host entirely, so a
 * local timestamp can sit ahead of the row it is meant to select and the decision goes unseen —
 * which read as "the agent never reached /api/pay" for a request that had in fact been judged.
 */
async function dbNow(): Promise<string> {
  const rows = (await getDb().execute(sql`select now() as t`)) as unknown as { t: string | Date }[];
  return new Date(rows[0].t).toISOString();
}

/** Every decision this situation produced. More than one means the model retried — worth seeing. */
async function decisionsSince(since: string): Promise<DecisionRow[]> {
  return (await getDb().execute(sql`
    select outcome, reasons, authorization_id
    from decisions
    where created_at >= ${since}
    order by created_at asc
  `)) as unknown as DecisionRow[];
}

async function remaining(authorizationId: string | null): Promise<string> {
  if (!authorizationId) return "—";
  const rows = (await getDb().execute(sql`
    select max_amount_paise::text as max from authorizations where id = ${authorizationId}
  `)) as unknown as { max: string }[];
  if (!rows[0]) return "—";
  const bal = await balances(authorizationId, BigInt(rows[0].max));
  return formatInr(bal.availablePaise);
}

/** The model's own account of what it did. Trimmed, because a wall of text is not evidence. */
function inItsOwnWords(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "(it reported nothing back)";
  return flat.length <= 200 ? flat : `${flat.slice(0, 197)}…`;
}

function verdict(row: DecisionRow): string {
  const reason = row.reasons[0];
  if (!reason) return "ADMITTED";
  const bound = Array.isArray(reason.expected) ? reason.expected.join(", ") : reason.expected;
  const label = row.outcome === "ESCALATE" ? "ESCALATED" : "REFUSED";
  const detail = reason.observed !== undefined ? ` — asked ${reason.observed}, allowed ${bound}` : "";
  return `${label}  ${reason.code}${detail}`;
}

async function main(): Promise<void> {
  console.log("\nNorthwind Coworking — their procurement agent, our catalogue.");
  console.log("It holds an API key and no payment credential, and is told needs, never part numbers.");
  console.log(`merchant ${BASE}\n`);

  const tally = { ADMIT: 0, ESCALATE: 0, REFUSE: 0, QUOTE_REFUSED: 0 };

  for (const [i, s] of SITUATIONS.entries()) {
    const since = await dbNow();
    console.log(`${i + 1}. ${s.what}`);
    console.log(`   The agent will ${s.intent}.`);

    // The model drives. A failure here is the model's, not the guard's, and it must not read as a
    // refusal — a guard that gets credit for an API timeout is measuring nothing.
    let run;
    try {
      run = await runBuyer({ baseUrl: BASE, apiKey: KEY, instruction: s.errand });
    } catch (error) {
      throw new Error(`situation ${i + 1}: the model call failed before reaching the guard — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
    console.log(`   "${inItsOwnWords(run.text)}"`);

    const rows = await decisionsSince(since);

    if (rows.length === 0) {
      // No decision means /api/pay was never reached. Expected when the merchant would not price the
      // order; a bug for anything else, so it is asserted rather than tolerated.
      if (s.expect !== "QUOTE_REFUSED") {
        throw new Error(`situation ${i + 1} expected ${s.expect}, but the request never reached the guard.`);
      }
      tally.QUOTE_REFUSED++;
      console.log(`   NOT PRICED  OUT_OF_STOCK — ${s.because}\n`);
      continue;
    }

    // Its own attempts, printed rather than smoothed over: a model that tried twice is a fact about
    // the run, and hiding it would make the demo the thing being tested instead of the guard.
    if (rows.length > 1) console.log(`   it tried ${rows.length} times`);

    const last = rows[rows.length - 1];
    console.log(`   ${verdict(last)}`);
    console.log(`   ${s.because} · mandate left ${await remaining(last.authorization_id)}\n`);

    if (last.outcome !== s.expect) {
      throw new Error(
        `situation ${i + 1} expected ${s.expect}, got ${last.outcome}. `
        + "If everything shifted by one, the mandate was not re-seeded — run npm run db:seed.",
      );
    }
    tally[last.outcome]++;
  }

  console.log("─".repeat(74));
  console.log("  Three outcomes, and what each one asks of a person:\n");
  console.log(`  ADMITTED   ${tally.ADMIT}   order created and held against the mandate`);
  console.log("             → nobody. The device authorises it; the agent never holds a credential.");
  console.log(`  ESCALATED  ${tally.ESCALATE}   accepted, but past what this agent was funded for`);
  console.log("             → a person decides, and completes it at the payment link.");
  console.log(`  REFUSED    ${tally.REFUSE}   nothing created, and the agent is told exactly why`);
  console.log("             → the buyer narrows the request, or is granted wider authority.");
  if (tally.QUOTE_REFUSED > 0) {
    console.log(`\n  ${tally.QUOTE_REFUSED} request never became an offer: we do not price what we cannot ship.`);
  }
  console.log("\n  Next:  npm run device   settles everything above in one pass.");
  console.log("─".repeat(74));
}

main().then(() => {
  console.log("\nRESTOCK RUN PASSED\n");
  process.exit(0);
}).catch((error) => {
  console.error(`\nRESTOCK RUN FAILED\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
