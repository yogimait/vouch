import { created, fail } from "@/core/http";
import { StaffRequest, fileRequest } from "@/demo/ops";
import { demoRoute } from "@/demo/route";

export async function POST(request: Request) {
  return demoRoute("demo.ops.request", async () => {
    const parsed = StaffRequest.safeParse(await request.json());
    if (!parsed.success) return fail("INVALID_REQUEST");
    return created(await fileRequest(parsed.data));
  });
}
