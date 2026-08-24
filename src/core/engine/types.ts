// Everything the decision needs, pre-fetched by the caller. Nothing here is looked up, and the
// clock arrives as ctx.now — that is what makes the 1000-run determinism test possible.
import type { ErrorCode } from "@/core/errors";

export type Outcome = "ADMIT" | "ESCALATE" | "REFUSE";

export interface Reason {
  code: ErrorCode;
  rule: string;
  message: string;
  /** observed/expected let the UI and the receipt say "you asked for X, the limit is Y". */
  observed?: string;
  expected?: string | string[];
}

export interface AgentFacts {
  id: string;
  status: "ACTIVE" | "FROZEN";
}

export interface OfferFacts {
  id: string;
  agentId: string;
  authorizationId: string;
  sku: string;
  category: string;
  qty: number;
  unitPricePaise: bigint;
  totalPaise: bigint;
  expiresAt: Date;
  /** Computed outside: node:crypto is banned in this folder, on purpose. */
  signatureValid: boolean;
  consumedAt: Date | null;
}

export interface AuthorizationFacts {
  id: string;
  status: string;
  maxAmountPaise: bigint;
  maxPerOrderPaise: bigint;
  maxOrdersPerHour: number;
  allowedCategories: string[];
  allowedSkus: string[];
  expireAt: Date;
  /** Derived from the ledger by the caller. Never a stored column. */
  debitedPaise: bigint;
  heldPaise: bigint;
}

export interface AdmissionContext {
  now: Date;
  agent: AgentFacts;
  offer: OfferFacts | null;
  authorization: AuthorizationFacts | null;
  /** What the agent says it believes the total is. Advisory: the server charges the offer's total. */
  claimedTotalPaise: bigint | null;
  ordersLastHour: number;
  inventory: number;
  policySnapshot: Record<string, unknown>;
  policyVersion: number;
}

export interface AdmissionResult {
  outcome: Outcome;
  reasons: Reason[];
  /** Every rule that was checked, in order, including the one that fired. */
  matchedRules: string[];
  escalatable: boolean;
  policyVersion: number;
  engineVersion: string;
  /** Stamped by the caller. A clock in here would break determinism. */
  latencyMs: number;
}

export type Rule = (ctx: AdmissionContext) => Reason | null;

export interface NamedRule {
  name: string;
  fn: Rule;
}

/** Remaining headroom on an authorization. Never negative. */
export function availablePaise(auth: AuthorizationFacts): bigint {
  const left = auth.maxAmountPaise - auth.debitedPaise - auth.heldPaise;
  return left > 0n ? left : 0n;
}
