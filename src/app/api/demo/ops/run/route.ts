import { eventStream } from "@/core/http";
import { opsStream } from "@/demo/ops";
import { demoRoute } from "@/demo/route";

// GET, because EventSource cannot POST. Claiming the errand is what stops a reconnect running twice.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("request") ?? "";
  return demoRoute("demo.ops.run", async () => eventStream(opsStream(id)));
}
