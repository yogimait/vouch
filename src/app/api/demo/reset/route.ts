import { ok } from "@/core/http";
import { resetDemo } from "@/demo/reset";
import { demoRoute } from "@/demo/route";

export async function POST() {
  return demoRoute("demo.reset", async () => ok(await resetDemo()));
}
