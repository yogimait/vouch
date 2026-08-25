import { agentRequest, handle } from "@/core/guards";
import { getQuote, QuoteRequest } from "@/core/tools";
import { fail, ok } from "@/core/http";

export async function POST(request: Request) {
  return handle("quote", async () => {
    const req = await agentRequest(request, QuoteRequest);
    if (!req.ok) return req.response;
    const r = await getQuote({ agentId: req.value.caller.id, source: "http", ...req.value.body });
    return r.ok ? ok(r.quote) : fail(r.code, r.details);
  });
}
