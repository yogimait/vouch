// Pure half of the state machine. The map is what stops a replayed webhook walking a settled order
// backwards, so it is worth asserting in both directions rather than only the happy path.
import { describe, expect, it } from "vitest";
import { canTransition, isTerminal, type OrderState } from "@/core/orders/state";

const ALL: OrderState[] = ["ADMITTED", "AWAITING_AUTHORIZATION", "ESCALATED", "PAID", "FAILED", "EXPIRED"];

describe("order state transitions", () => {
  it("admits then awaits authorization", () => {
    expect(canTransition("ADMITTED", "AWAITING_AUTHORIZATION")).toBe(true);
    expect(canTransition("AWAITING_AUTHORIZATION", "PAID")).toBe(true);
  });

  it("escalates and can still be paid by a human", () => {
    expect(canTransition("ADMITTED", "ESCALATED")).toBe(true);
    expect(canTransition("ESCALATED", "PAID")).toBe(true);
  });

  it("never leaves a terminal state", () => {
    for (const from of ["PAID", "FAILED", "EXPIRED"] as OrderState[]) {
      expect(isTerminal(from)).toBe(true);
      for (const to of ALL) expect(canTransition(from, to)).toBe(false);
    }
  });

  it("never skips authorization", () => {
    expect(canTransition("ADMITTED", "PAID")).toBe(false);
  });

  it("never reopens a settled order", () => {
    expect(canTransition("PAID", "AWAITING_AUTHORIZATION")).toBe(false);
    expect(canTransition("PAID", "FAILED")).toBe(false);
  });
});
