import { ok } from "@/core/http";
import { runGate } from "@/demo/gate";
import { demoRoute } from "@/demo/route";

export async function POST() {
  return demoRoute("demo.gate", async () => ok(await runGate()));
}
