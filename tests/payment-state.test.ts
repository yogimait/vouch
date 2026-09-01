// What the Decisions table now says happened to the money after the gate answered.
//
// The column it replaced reported how the call arrived, which is a fact about our plumbing. This one
// reports whether an admitted order was ever paid, and the two answers a reader must not be given by
// mistake are "paid" for an order nobody paid, and "expired" for one that settled late.
import { describe, expect, it } from "vitest";
import { paymentOf } from "@/core/db/queries";

describe("what became of the order", () => {
  it("says nothing about a decision that created no order", () => {
    expect(paymentOf(null, false)).toBeNull();
    expect(paymentOf(null, true)).toBeNull();
  });

  it("reads a settled order as paid even when its deadline has passed", () => {
    // EXPIRED -> PAID is a legal transition (core/orders/state.ts): a capture can land at minute
    // sixteen. Checking the clock before the state would report that money as expired.
    expect(paymentOf("PAID", true)).toBe("PAID");
    expect(paymentOf("EXPIRED", false)).toBe("EXPIRED");
  });

  it("separates an unpaid hold from one waiting on a person", () => {
    expect(paymentOf("ADMITTED", false)).toBe("AWAITING_PAYMENT");
    expect(paymentOf("AWAITING_AUTHORIZATION", false)).toBe("AWAITING_PAYMENT");
    expect(paymentOf("ESCALATED", false)).toBe("AWAITING_APPROVAL");
    expect(paymentOf("FAILED", false)).toBe("FAILED");
  });

  it("expires a hold the sweep has not reached yet", () => {
    // Vercel caps Hobby crons at once a day, so a row can sit past its deadline still saying
    // ESCALATED. The console must not offer approval on a window that has already shut.
    expect(paymentOf("ESCALATED", true)).toBe("EXPIRED");
    expect(paymentOf("ADMITTED", true)).toBe("EXPIRED");
  });
});
