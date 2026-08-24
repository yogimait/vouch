import { describe, expect, it } from "vitest";
import { formatInr, paiseFromSql, toPaise, toRazorpayAmount, toRupees } from "@/core/money";

describe("toPaise", () => {
  it.each([
    ["0", 0n],
    ["1", 100n],
    ["3500", 350000n],
    ["3500.00", 350000n],
    ["3500.5", 350050n],
    ["0.01", 1n],
    ["10500.00", 1050000n],
  ])("%s -> %s", (input, expected) => {
    expect(toPaise(input)).toBe(expected);
  });

  it.each(["-1", "1.234", "1e3", "1.", ".5", "abc", "", " ", "1,000"])(
    "rejects %s",
    (bad) => { expect(() => toPaise(bad)).toThrow(); },
  );
});

describe("toRupees", () => {
  it.each([
    [0n, "0.00"],
    [1n, "0.01"],
    [350000n, "3500.00"],
    [350050n, "3500.50"],
  ])("%s -> %s", (input, expected) => {
    expect(toRupees(input)).toBe(expected);
  });

  it("refuses a negative", () => {
    expect(() => toRupees(-1n)).toThrow();
  });

  it("round-trips", () => {
    for (const v of ["0.00", "0.01", "1.00", "3500.50", "99999999.99"]) {
      expect(toRupees(toPaise(v))).toBe(v);
    }
  });
});

describe("formatInr", () => {
  it("groups in lakhs", () => {
    // Intl uses a narrow no-break space in some ICU builds, so compare on digits.
    expect(formatInr(toPaise("150000.00")).replace(/\s/g, "")).toBe("₹1,50,000.00");
  });
});

describe("toRazorpayAmount", () => {
  it("converts at the SDK boundary", () => {
    expect(toRazorpayAmount(350000n)).toBe(350000);
  });

  it("refuses anything that would lose precision as a Number", () => {
    expect(() => toRazorpayAmount(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow();
  });

  it("refuses a negative", () => {
    expect(() => toRazorpayAmount(-1n)).toThrow();
  });
});

describe("paiseFromSql", () => {
  it("reads the ::text cast without going through a float", () => {
    expect(paiseFromSql("9007199254740993")).toBe(9007199254740993n);
  });

  it("treats null as zero", () => {
    expect(paiseFromSql(null)).toBe(0n);
  });
});
