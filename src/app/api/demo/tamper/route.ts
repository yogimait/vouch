import { fail, ok } from "@/core/http";
import { TamperRequest, tamperReceipt } from "@/demo/tamper";
import { demoRoute } from "@/demo/route";

export async function POST(request: Request) {
  return demoRoute("demo.tamper", async () => {
    const parsed = TamperRequest.safeParse(await request.json());
    if (!parsed.success) return fail("INVALID_REQUEST");
    const r = await tamperReceipt(parsed.data);
    return r.ok ? ok(r) : fail("RECEIPT_UNKNOWN", { reason: r.code });
  });
}
