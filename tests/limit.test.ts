// The transport limiter. Pure, so it runs with no database and no clock of its own — `now` is a
// parameter for exactly that reason.
//
// What matters here is the failure direction. This protects the audit chain's global lock from a
// fast loop; it is not an authorization control, and it must never refuse a legitimate caller to
// protect its own Map.
import { beforeEach, describe, expect, it } from "vitest";
import { resetLimits, take } from "@/core/limit";

describe("rate limit", () => {
  beforeEach(() => resetLimits());

  it("allows up to the limit and refuses past it", () => {
    for (let i = 0; i < 3; i++) expect(take("k", 3, 1000, 0).ok, `call ${i + 1}`).toBe(true);
    expect(take("k", 3, 1000, 0).ok).toBe(false);
  });

  it("tells the caller when to come back", () => {
    for (let i = 0; i < 3; i++) take("k", 3, 60_000, 0);
    const over = take("k", 3, 60_000, 30_000);
    expect(over.ok).toBe(false);
    // Half the window has passed, so 30s remain. A Retry-After of 0 would invite an instant retry.
    expect(over.retryAfter).toBe(30);
    expect(over.retryAfter).toBeGreaterThan(0);
  });

  it("forgets once the window rolls over", () => {
    for (let i = 0; i < 3; i++) take("k", 3, 1000, 0);
    expect(take("k", 3, 1000, 0).ok).toBe(false);
    expect(take("k", 3, 1000, 1001).ok).toBe(true);
  });

  it("counts each key on its own", () => {
    for (let i = 0; i < 3; i++) take("a", 3, 1000, 0);
    expect(take("a", 3, 1000, 0).ok).toBe(false);
    // One noisy agent must not refuse every other agent.
    expect(take("b", 3, 1000, 0).ok).toBe(true);
  });

  it("fails open rather than growing without bound", () => {
    // A key space an attacker controls must not be able to grow the map for ever. Eviction loses
    // counters, and losing a counter lets a caller through — which is the right direction for a
    // speed bump. Refusing real callers to protect a Map would be the wrong one.
    for (let i = 0; i < 12_000; i++) take(`flood_${i}`, 1, 60_000, 0);
    expect(take("legitimate", 5, 60_000, 0).ok).toBe(true);
  });
});
