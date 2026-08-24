// The contract: every rule PASSES on makeContext(). Each test overrides exactly one field, so a
// failure names one cause and never two.
import type {
  AdmissionContext, AgentFacts, AuthorizationFacts, OfferFacts,
} from "@/core/engine/types";
import { toPaise } from "@/core/money";

export const NOW = new Date("2026-08-24T12:00:00.000Z");
export const AGENT_ID = "agt_01J0000000000000000SHOPBOT";
export const AUTH_ID = "auth_01J00000000000000SHOPBOT";

export function makeAgent(overrides: Partial<AgentFacts> = {}): AgentFacts {
  return { id: AGENT_ID, status: "ACTIVE", ...overrides };
}

export function makeOffer(overrides: Partial<OfferFacts> = {}): OfferFacts {
  return {
    id: "off_01J9ZQ2V8K3MABCDEFGHJKMNPQ",
    agentId: AGENT_ID,
    authorizationId: AUTH_ID,
    sku: "SKU-A",
    category: "peripherals",
    // One unit: comfortably under both the Rs 5,000 per-order cap and the Rs 9,000 headroom, so
    // every rule passes here and a test that trips one has trippped exactly one.
    qty: 1,
    unitPricePaise: toPaise("3500.00"),
    totalPaise: toPaise("3500.00"),
    expiresAt: new Date(NOW.getTime() + 120_000),
    signatureValid: true,
    consumedAt: null,
    ...overrides,
  };
}

export function makeAuthorization(overrides: Partial<AuthorizationFacts> = {}): AuthorizationFacts {
  return {
    id: AUTH_ID,
    status: "confirmed",
    maxAmountPaise: toPaise("9000.00"),
    maxPerOrderPaise: toPaise("5000.00"),
    maxOrdersPerHour: 10,
    allowedCategories: ["peripherals", "accessories", "audio"],
    allowedSkus: [],
    expireAt: new Date(NOW.getTime() + 30 * 24 * 3600_000),
    debitedPaise: 0n,
    heldPaise: 0n,
    ...overrides,
  };
}

export function makeContext(overrides: Partial<AdmissionContext> = {}): AdmissionContext {
  return {
    now: NOW,
    agent: makeAgent(),
    offer: makeOffer(),
    authorization: makeAuthorization(),
    claimedTotalPaise: null,
    ordersLastHour: 0,
    inventory: 40,
    policySnapshot: { source: "fixture" },
    policyVersion: 1,
    ...overrides,
  };
}
