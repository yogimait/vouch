import { ok } from "@/core/http";
import { receiveStock } from "@/demo/ops";
import { demoRoute } from "@/demo/route";

// Tops our own catalogue back to the level each line was stocked at. Their cupboard is /reset.
export async function POST() {
  return demoRoute("demo.ops.restock", async () => ok(await receiveStock()));
}
