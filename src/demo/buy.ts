// One purchase, narrated. The console needs the steps, not just the verdict — "REFUSED" on its own
// is indistinguishable from a bug, and the point of this project is that a refusal is legible.
//
// The two optional fields are the lie surfaces: a discount code the merchant never issued, and a
// claimed total that is not the signed one. Both are parameters a real commerce API would have.
import { z } from "zod";
import { formatInr } from "@/core/money";
import { getQuote, payForOffer } from "@/core/tools";
import { demoAgent, type DemoAgent } from "@/demo/agents";

// claimedTotalPaise is deliberately not digit-checked: an unreadable claim is one of the answers
// worth showing, and validating it away would hide a real branch.
export const BuyRequest = z.object({
  sku: z.string().min(1).max(64),
  qty: z.number().int().positive().max(1000).default(1),
  discountCode: z.string().max(64).nullish(),
  claimedTotalPaise: z.string().max(32).nullish(),
  agent: z.enum(["shopbot", "frozen"]).default("shopbot"),
});

export type BuyInput = z.infer<typeof BuyRequest> & { agent?: DemoAgent };

export interface BuyStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface BuyResult {
  agentName: string;
  steps: BuyStep[];
  outcome: "ADMIT" | "ESCALATE" | "REFUSE";
  code: string | null;
  message: string;
  reasons: { code: string; rule?: string; message: string; observed?: string; expected?: string }[];
  orderId: string | null;
  /** Where a browser must go to authorise it — our own checkout, or a link for a human. */
  payUrl: string | null;
  totalDisplay: string | null;
  offerToken: string | null;
}

export async function demoBuy(input: BuyInput): Promise<BuyResult> {
  const agent = await demoAgent(input.agent ?? "shopbot");
  const caller = { agentId: agent.id, source: "http" as const };
  const steps: BuyStep[] = [];

  const quoted = await getQuote({
    ...caller, sku: input.sku, qty: input.qty,
    discount_code: input.discountCode ?? null,
    raw_agent_text: input.discountCode ? `Applying discount code ${input.discountCode}.` : null,
  });

  if (!quoted.ok) {
    steps.push({ name: "get_quote", ok: false, detail: `${quoted.code} — the merchant would not sign that price.` });
    return {
      agentName: agent.name, steps, outcome: "REFUSE", code: quoted.code,
      message: "Refused before a price ever existed.",
      reasons: [{ code: quoted.code, message: "Agents select from merchant-approved offers only. They cannot create discounts." }],
      orderId: null, payUrl: null, totalDisplay: null, offerToken: null,
    };
  }

  const quote = quoted.quote;
  steps.push({ name: "get_quote", ok: true, detail: `Merchant signed ${quote.qty} × ${quote.sku} at ${quote.total_display}.` });

  if (input.claimedTotalPaise) {
    steps.push({ name: "claim", ok: true, detail: `The agent will assert a total of ${asMoney(input.claimedTotalPaise)}.` });
  }

  const paid = await payForOffer({
    ...caller,
    offer_token: quote.offer_token,
    idempotency_key: `console_${quote.offer_id}`,
    claimed_total_paise: input.claimedTotalPaise ?? null,
    raw_agent_text: input.claimedTotalPaise ? `Paying ${asMoney(input.claimedTotalPaise)} for ${quote.qty} × ${quote.sku}.` : null,
    label: "console",
  });

  if (paid.outcome === "ADMIT") {
    steps.push({ name: "evaluate", ok: true, detail: "All thirteen rules passed. Money reserved against the mandate." });
    steps.push({ name: "authorize", ok: true, detail: "Razorpay order created. A payment credential is needed next." });
    return {
      agentName: agent.name, steps, outcome: "ADMIT", code: null,
      message: "Inside the mandate. Nobody had to be asked.",
      reasons: [], orderId: paid.orderId, payUrl: paid.authorizationUrl,
      totalDisplay: quote.total_display, offerToken: quote.offer_token,
    };
  }

  const reasons = paid.reasons.map((r) => ({
    code: r.code, rule: r.rule, message: r.message,
    observed: flat(r.observed), expected: flat(r.expected),
  }));

  if (paid.outcome === "ESCALATE") {
    steps.push({ name: "evaluate", ok: false, detail: `${reasons[0]?.code} — legitimate, but past what this agent was delegated.` });
    steps.push({ name: "escalate", ok: true, detail: "Nothing held. A human can complete the same purchase." });
    return {
      agentName: agent.name, steps, outcome: "ESCALATE", code: reasons[0]?.code ?? null,
      message: "Beyond this agent's authority. A person can still pay it.",
      reasons, orderId: paid.orderId, payUrl: paid.paymentLink ?? null,
      totalDisplay: quote.total_display, offerToken: quote.offer_token,
    };
  }

  steps.push({ name: "evaluate", ok: false, detail: `${paid.code} — refused. No order exists.` });
  return {
    agentName: agent.name, steps, outcome: "REFUSE", code: paid.code,
    message: "Refused. The attempt is on the record and no money moved.",
    reasons, orderId: null, payUrl: null,
    totalDisplay: quote.total_display, offerToken: quote.offer_token,
  };
}

function flat(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(", ") : value;
}

function asMoney(paise: string): string {
  return /^\d+$/.test(paise) ? formatInr(BigInt(paise)) : `${paise} (not a number)`;
}
