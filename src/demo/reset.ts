// Back to the seeded starting point, so a demo can be run twice on the same laptop.
//
// Destructive by design — seed() truncates. It is reachable only where demoEnabled() is true.
import { seed } from "@/core/db/seed";

export async function resetDemo(): Promise<{ reset: true; at: string }> {
  await seed();
  return { reset: true, at: new Date().toISOString() };
}
