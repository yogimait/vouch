import { ok } from "@/core/http";
import { resetOps } from "@/demo/ops";
import { demoRoute } from "@/demo/route";

// Refills the cupboard only. seed() would truncate the receipts and the audit chain with it.
export async function POST() {
  return demoRoute("demo.ops.reset", async () => ok(await resetOps()));
}
