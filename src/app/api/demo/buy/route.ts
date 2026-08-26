import { fail, ok } from "@/core/http";
import { BuyRequest, demoBuy } from "@/demo/buy";
import { demoRoute } from "@/demo/route";

export async function POST(request: Request) {
  return demoRoute("demo.buy", async () => {
    const parsed = BuyRequest.safeParse(await request.json());
    if (!parsed.success) return fail("INVALID_REQUEST");
    return ok(await demoBuy(parsed.data));
  });
}
