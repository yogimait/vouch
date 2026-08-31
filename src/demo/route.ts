// The demo console can spend the seeded authorization without a credential, so it is off unless a
// deployment asks for it, in exactly one word.
//
// It used to fall back to NODE_ENV !== "production", which is not a decision: staging, NODE_ENV=test
// and any container that leaves the variable unset all read as "on". A gate in front of routes that
// move money and call a paid model has to be opened deliberately, so local development sets
// DEMO_CONSOLE=1 in .env.local like every other deployment.
import { handle } from "@/core/guards";
import { fail } from "@/core/http";

export function demoEnabled(): boolean {
  return process.env.DEMO_CONSOLE === "1";
}

export async function demoRoute(name: string, run: () => Promise<Response>): Promise<Response> {
  if (!demoEnabled()) return fail("DEMO_DISABLED");
  return handle(name, run);
}
