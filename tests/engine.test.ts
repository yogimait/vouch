import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, evaluate } from "@/core/engine/engine";
import { RULES } from "@/core/engine/rules";
import { availablePaise, type AdmissionContext } from "@/core/engine/types";
import { toPaise } from "@/core/money";
import { makeAuthorization, makeContext, makeOffer, NOW } from "./fixtures";

describe("the clean context", () => {
  it("admits, with no reasons", () => {
    const result = evaluate(makeContext());
    expect(result.outcome).toBe("ADMIT");
    expect(result.reasons).toEqual([]);
    expect(result.escalatable).toBe(false);
  });

  it("reports every rule it checked, in order", () => {
    expect(evaluate(makeContext()).matchedRules).toEqual(RULES.map((r) => r.name));
  });
});

// One override per row. If a row fails, exactly one thing is wrong.
const TRIPS: [string, Partial<AdmissionContext>, string, "REFUSE" | "ESCALATE"][] = [
  ["frozen agent", { agent: { id: "agt_x", status: "FROZEN" } }, "AGENT_FROZEN", "REFUSE"],
  ["bad signature", { offer: makeOffer({ signatureValid: false }) }, "OFFER_SIGNATURE_INVALID", "REFUSE"],
  ["expired offer", { offer: makeOffer({ expiresAt: new Date(NOW.getTime() - 1) }) }, "OFFER_EXPIRED", "REFUSE"],
  ["offer for another agent", { offer: makeOffer({ agentId: "agt_other" }) }, "OFFER_WRONG_AGENT", "REFUSE"],
  ["offer already used", { offer: makeOffer({ consumedAt: NOW }) }, "OFFER_ALREADY_USED", "REFUSE"],
  ["claimed a discount", { claimedTotalPaise: toPaise("2625.00") }, "MISQUOTE", "REFUSE"],
  ["authorization not confirmed", { authorization: makeAuthorization({ status: "initiated" }) }, "AUTHORIZATION_NOT_CONFIRMED", "REFUSE"],
  ["authorization expired", { authorization: makeAuthorization({ expireAt: new Date(NOW.getTime() - 1) }) }, "AUTHORIZATION_EXPIRED", "REFUSE"],
  ["category out of scope", { offer: makeOffer({ category: "furniture" }) }, "SKU_NOT_AUTHORIZED", "REFUSE"],
  ["sku not on an explicit allowlist", { authorization: makeAuthorization({ allowedSkus: ["SKU-Z"] }) }, "SKU_NOT_AUTHORIZED", "REFUSE"],
  ["over the per-order cap", { offer: makeOffer({ qty: 2, totalPaise: toPaise("7000.00") }) }, "PER_ORDER_LIMIT_EXCEEDED", "ESCALATE"],
  ["over remaining headroom", { authorization: makeAuthorization({ debitedPaise: toPaise("8000.00") }) }, "AUTHORIZATION_EXCEEDED", "ESCALATE"],
  ["too many orders this hour", { ordersLastHour: 10 }, "VELOCITY_EXCEEDED", "REFUSE"],
  ["not enough stock", { inventory: 0 }, "OUT_OF_STOCK", "REFUSE"],
];

describe("each rule trips on exactly its own input", () => {
  it.each(TRIPS)("%s -> %s", (_name, override, code, outcome) => {
    const result = evaluate(makeContext(override));
    expect(result.outcome).toBe(outcome);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].code).toBe(code);
  });

  it("carries observed and expected so a client needs no second lookup", () => {
    const reason = evaluate(makeContext({ claimedTotalPaise: toPaise("2625.00") })).reasons[0];
    expect(reason.observed).toBe("262500");
    expect(reason.expected).toBe("350000");
  });

  it("never admits when any rule produced a reason", () => {
    for (const [, override] of TRIPS) {
      expect(evaluate(makeContext(override)).outcome).not.toBe("ADMIT");
    }
  });
});

describe("escalate versus refuse", () => {
  it("escalates only the two money-ceiling rules", () => {
    const escalating = TRIPS.filter(([, , , outcome]) => outcome === "ESCALATE").map(([, , code]) => code);
    expect(escalating).toEqual(["PER_ORDER_LIMIT_EXCEEDED", "AUTHORIZATION_EXCEEDED"]);
  });

  it("marks an escalation escalatable and a refusal not", () => {
    expect(evaluate(makeContext({ ordersLastHour: 10 })).escalatable).toBe(false);
    expect(evaluate(makeContext({ authorization: makeAuthorization({ debitedPaise: toPaise("8000.00") }) })).escalatable).toBe(true);
  });
});

describe("precedence", () => {
  it("stops at the first failure, not the worst one", () => {
    // Frozen agent (rule 1) and a bad signature (rule 2) at once.
    const result = evaluate(makeContext({
      agent: { id: "agt_x", status: "FROZEN" },
      offer: makeOffer({ signatureValid: false }),
    }));
    expect(result.reasons[0].code).toBe("AGENT_FROZEN");
    expect(result.matchedRules).toEqual(["agent.status"]);
  });
});

describe("deny by default", () => {
  it("refuses with no offer", () => {
    const result = evaluate(makeContext({ offer: null }));
    expect(result.outcome).toBe("REFUSE");
    expect(result.reasons[0].code).toBe("OFFER_UNKNOWN");
    expect(result.matchedRules).toEqual([]);
  });

  it("refuses with no authorization", () => {
    expect(evaluate(makeContext({ authorization: null })).reasons[0].code).toBe("AUTHORIZATION_UNKNOWN");
  });

  it("refuses when a rule throws", () => {
    const exploding = { name: "boom", fn: () => { throw new Error("kaboom"); } };
    RULES.splice(0, 0, exploding);
    try {
      const result = evaluate(makeContext());
      expect(result.outcome).toBe("REFUSE");
      expect(result.reasons[0].code).toBe("GUARD_UNAVAILABLE");
    } finally {
      RULES.splice(0, 1);
    }
    expect(evaluate(makeContext()).outcome).toBe("ADMIT");
  });

  it("refuses on a malformed amount rather than admitting", () => {
    const result = evaluate(makeContext({
      offer: makeOffer({ totalPaise: "not a bigint" as unknown as bigint }),
    }));
    expect(result.outcome).toBe("REFUSE");
  });
});

describe("determinism", () => {
  it("returns an identical result 1000 times", () => {
    const ctx = makeContext();
    const first = evaluate(ctx);
    for (let i = 0; i < 1000; i += 1) expect(evaluate(ctx)).toEqual(first);
  });

  it("does not read a clock of its own", () => {
    const ctx = makeContext({ offer: makeOffer({ expiresAt: new Date(NOW.getTime() + 1) }) });
    expect(evaluate(ctx).outcome).toBe("ADMIT");
    // Same context, only ctx.now moved forward.
    expect(evaluate({ ...ctx, now: new Date(NOW.getTime() + 2) }).reasons[0].code).toBe("OFFER_EXPIRED");
  });

  it("stamps the engine version and leaves latency to the caller", () => {
    const result = evaluate(makeContext());
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.latencyMs).toBe(0);
  });
});

describe("availablePaise", () => {
  it("subtracts both debited and held", () => {
    expect(availablePaise(makeAuthorization({
      debitedPaise: toPaise("3500.00"), heldPaise: toPaise("1000.00"),
    }))).toBe(toPaise("4500.00"));
  });

  it("floors at zero rather than going negative", () => {
    expect(availablePaise(makeAuthorization({ debitedPaise: toPaise("99999.00") }))).toBe(0n);
  });
});
