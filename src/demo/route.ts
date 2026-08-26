// The demo console can spend the seeded authorization without a credential, so it is off unless a
// deployment asks for it. Local development is the exception, not the rule.
import { handle } from "@/core/guards";
import { fail } from "@/core/http";

export function demoEnabled(): boolean {
  const flag = process.env.DEMO_CONSOLE;
  if (flag) return flag === "1";
  return process.env.NODE_ENV !== "production";
}

export async function demoRoute(name: string, run: () => Promise<Response>): Promise<Response> {
  if (!demoEnabled()) return fail("DEMO_DISABLED");
  return handle(name, run);
}
