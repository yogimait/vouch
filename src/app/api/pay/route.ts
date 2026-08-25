import { agentRequest, handle } from "@/core/guards";
import { payForOffer, PayRequest } from "@/core/tools";
import { payResponse } from "@/core/http";

export async function POST(request: Request) {
  return handle("pay", async () => {
    const req = await agentRequest(request, PayRequest);
    if (!req.ok) return req.response;
    return payResponse(await payForOffer({ agentId: req.value.caller.id, source: "http", ...req.value.body }));
  });
}
