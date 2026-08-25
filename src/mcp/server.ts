// The MCP surface. Same four functions as the HTTP routes, second encoding — no logic lives here.
//
// The agent authenticates as ITSELF (VOUCH_AGENT_KEY), not as the merchant. That is the whole
// contrast with Razorpay's own MCP server, whose 45 tools all authenticate as the merchant: an
// agent holding those credentials can do anything the merchant can.
//
// stdout belongs to the protocol. Every diagnostic here goes to console.error, and one stray
// console.log anywhere in the import graph corrupts the stream.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { agentByKey } from "@/core/guards";
import { getCatalog, getQuote, getReceipt, payForOffer, PayRequest, QuoteRequest } from "@/core/tools";
import { messageFor, type ErrorCode } from "@/core/errors";

const VERSION = "1.0.0";

/** One text block plus structuredContent, so a model and a program read the same answer. */
function reply(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function refusal(code: ErrorCode, details?: Record<string, unknown>) {
  return reply({ ok: false, code, message: messageFor(code), details: details ?? {} });
}

async function resolveAgentId(): Promise<string> {
  const key = process.env.VOUCH_AGENT_KEY;
  if (!key) throw new Error("VOUCH_AGENT_KEY is not set. This server authenticates as one agent.");

  const agent = await agentByKey(key);
  if (!agent) throw new Error("VOUCH_AGENT_KEY does not match any agent.");
  return agent.id;
}

export async function buildServer(): Promise<McpServer> {
  const agentId = await resolveAgentId();
  const caller = { agentId, source: "mcp" as const };
  const server = new McpServer({ name: "vouch", version: VERSION });

  server.registerTool("get_catalog", {
    title: "Browse catalogue",
    description: "List what this merchant sells. Prices here are indicative; only get_quote is binding.",
    inputSchema: z.object({}),
  }, async () => reply(await getCatalog(caller)));

  server.registerTool("get_quote", {
    title: "Get a signed price",
    description:
      "Ask the merchant to sign a price for a sku and quantity. Returns offer_token, which is the "
      + "only thing pay accepts. discount_code is optional and is rejected unless the merchant "
      + "issued it — agents select from merchant-approved offers, they do not create discounts.",
    inputSchema: QuoteRequest,
  }, async (args) => {
    const r = await getQuote({ ...caller, ...args });
    return r.ok ? reply({ ok: true, ...r.quote }) : refusal(r.code, r.details);
  });

  server.registerTool("pay", {
    title: "Pay against a signed offer",
    description:
      "Pay for a previously quoted offer. There is no amount parameter: the server charges the "
      + "offer_token's own total. claimed_total_paise is advisory — if it disagrees with the token "
      + "the payment is refused and the discrepancy is recorded. Returns an authorization_url; a "
      + "device holding the payment credential completes it, never this agent.",
    inputSchema: PayRequest,
  }, async (args) => {
    const r = await payForOffer({ ...caller, ...args });
    if (r.outcome === "REFUSE") {
      const reason = r.reasons[0];
      return refusal(r.code, { observed: reason?.observed, expected: reason?.expected, rule: reason?.rule, decision_id: r.decisionId });
    }
    return reply({
      ok: true,
      outcome: r.outcome,
      order_id: r.orderId,
      amount_paise: r.amountPaise.toString(),
      decision_id: r.decisionId,
      replayed: r.replayed,
      ...(r.outcome === "ADMIT"
        ? { authorization_url: r.authorizationUrl }
        : { payment_link: r.paymentLink, reasons: r.reasons, note: "Beyond your delegated authority. A human can complete it." }),
    });
  });

  server.registerTool("get_receipt", {
    title: "Fetch the receipt",
    description:
      "Fetch the signed, dispute-grade receipt for a settled order. The bundle carries the public "
      + "key, so anyone can verify it without contacting this merchant.",
    inputSchema: z.object({ orderId: z.string().min(1).max(64) }),
  }, async ({ orderId }) => {
    const r = await getReceipt({ ...caller, orderId });
    return r.ok ? reply(r) : refusal(r.code, r.details);
  });

  return server;
}

// Only serve when run directly, so tests can import buildServer without seizing stdio.
if (process.argv[1]?.includes("mcp")) {
  serveStdio(() => buildServer(), { onerror: (error) => console.error("[mcp]", error) });
  console.error(`vouch mcp ${VERSION} on stdio`);
}
