import { ok } from "@/core/http";
import { opsTick } from "@/demo/ops";
import { demoRoute } from "@/demo/route";

// POST, not GET: a tick consumes stock, and a prefetch must never spend the buyer's supplies.
export async function POST() {
  return demoRoute("demo.ops.tick", async () => ok(await opsTick()));
}
