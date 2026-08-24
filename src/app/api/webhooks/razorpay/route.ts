import { handleWebhook } from "@/core/orders/webhook";
import { fail, ok } from "@/core/http";

// request.text(), never .json(): the HMAC is over the exact bytes Razorpay sent.
// Everything except a bad signature returns 200 — Razorpay retries non-2xx, and a receipt bug
// must not turn into a retry storm.
export async function POST(request: Request) {
  const raw = await request.text();
  const result = await handleWebhook(raw, request.headers.get("x-razorpay-signature"));
  if (result.reason === "signature_invalid") return fail("WEBHOOK_SIGNATURE_INVALID");
  return ok(result);
}
