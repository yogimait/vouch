// Thirteen rules, first match wins, in precedence order. Each is pure: (ctx) => Reason | null.
// No clock, no DB, no crypto — ESLint fails the build on any of those imports.
import { formatInr } from "@/core/money";
import { availablePaise, type AdmissionContext, type NamedRule, type Reason } from "@/core/engine/types";

// Every rule below runs after the null guards in engine.ts, so these are safe.
const offerOf = (ctx: AdmissionContext) => ctx.offer!;
const authOf = (ctx: AdmissionContext) => ctx.authorization!;

const agentActive: NamedRule = {
  name: "agent.status",
  fn: (ctx) => ctx.agent.status === "ACTIVE" ? null : {
    code: "AGENT_FROZEN",
    rule: "agent.status",
    message: "Agent is frozen and may not spend.",
    observed: ctx.agent.status,
    expected: "ACTIVE",
  },
};

const offerSignature: NamedRule = {
  name: "offer.signature",
  fn: (ctx) => offerOf(ctx).signatureValid ? null : {
    code: "OFFER_SIGNATURE_INVALID",
    rule: "offer.signature",
    message: "Offer token signature is not valid.",
  },
};

const offerFresh: NamedRule = {
  name: "offer.expiry",
  fn: (ctx) => {
    const offer = offerOf(ctx);
    if (offer.expiresAt.getTime() > ctx.now.getTime()) return null;
    return {
      code: "OFFER_EXPIRED",
      rule: "offer.expiry",
      message: "Offer has expired. Request a new quote.",
      observed: ctx.now.toISOString(),
      expected: offer.expiresAt.toISOString(),
    };
  },
};

const offerBelongsToAgent: NamedRule = {
  name: "offer.agentBinding",
  fn: (ctx) => {
    const offer = offerOf(ctx);
    if (offer.agentId === ctx.agent.id) return null;
    return {
      code: "OFFER_WRONG_AGENT",
      rule: "offer.agentBinding",
      message: "Offer was issued to a different agent.",
      observed: ctx.agent.id,
      expected: offer.agentId,
    };
  },
};

const offerUnused: NamedRule = {
  name: "offer.singleUse",
  fn: (ctx) => {
    const offer = offerOf(ctx);
    if (!offer.consumedAt) return null;
    return {
      code: "OFFER_ALREADY_USED",
      rule: "offer.singleUse",
      message: "Offer has already been used.",
      observed: offer.consumedAt.toISOString(),
    };
  },
};

// The agent may assert what it thinks it is paying. The server charges the signed total regardless,
// and a mismatch is recorded rather than quietly corrected.
const claimMatchesOffer: NamedRule = {
  name: "offer.claimedTotal",
  fn: (ctx) => {
    const offer = offerOf(ctx);
    if (ctx.claimedTotalPaise === null || ctx.claimedTotalPaise === offer.totalPaise) return null;
    return {
      code: "MISQUOTE",
      rule: "offer.claimedTotal",
      message: `The signed offer totals ${formatInr(offer.totalPaise)}. Your claimed total of ${formatInr(ctx.claimedTotalPaise)} is not honoured. Offers are merchant-signed; agents cannot create discounts.`,
      observed: ctx.claimedTotalPaise.toString(),
      expected: offer.totalPaise.toString(),
    };
  },
};

const authorizationConfirmed: NamedRule = {
  name: "authorization.status",
  fn: (ctx) => {
    const auth = authOf(ctx);
    if (auth.status === "confirmed") return null;
    return {
      code: "AUTHORIZATION_NOT_CONFIRMED",
      rule: "authorization.status",
      message: "Authorization is not confirmed.",
      observed: auth.status,
      expected: "confirmed",
    };
  },
};

const authorizationFresh: NamedRule = {
  name: "authorization.expiry",
  fn: (ctx) => {
    const auth = authOf(ctx);
    if (auth.expireAt.getTime() > ctx.now.getTime()) return null;
    return {
      code: "AUTHORIZATION_EXPIRED",
      rule: "authorization.expiry",
      message: "Authorization has expired.",
      observed: ctx.now.toISOString(),
      expected: auth.expireAt.toISOString(),
    };
  },
};

const skuInScope: NamedRule = {
  name: "authorization.scope",
  fn: (ctx) => {
    const offer = offerOf(ctx);
    const auth = authOf(ctx);

    // An explicit SKU allowlist, when present, is the tighter grant and wins.
    if (auth.allowedSkus.length > 0) {
      if (auth.allowedSkus.includes(offer.sku)) return null;
      return {
        code: "SKU_NOT_AUTHORIZED",
        rule: "authorization.scope",
        message: `${offer.sku} is not in the authorization's allowed items.`,
        observed: offer.sku,
        expected: auth.allowedSkus,
      };
    }

    if (auth.allowedCategories.includes(offer.category)) return null;
    return {
      code: "SKU_NOT_AUTHORIZED",
      rule: "authorization.scope",
      message: `Category "${offer.category}" is outside the authorization's scope.`,
      observed: offer.category,
      expected: auth.allowedCategories,
    };
  },
};

// Escalatable: legitimate, but beyond what THIS agent was delegated. A human can still complete it.
const perOrderCap: NamedRule = {
  name: "authorization.maxPerOrder",
  fn: (ctx) => {
    const offer = offerOf(ctx);
    const auth = authOf(ctx);
    if (offer.totalPaise <= auth.maxPerOrderPaise) return null;
    return {
      code: "PER_ORDER_LIMIT_EXCEEDED",
      rule: "authorization.maxPerOrder",
      message: `Order of ${formatInr(offer.totalPaise)} exceeds the per-order limit of ${formatInr(auth.maxPerOrderPaise)}.`,
      observed: offer.totalPaise.toString(),
      expected: auth.maxPerOrderPaise.toString(),
    };
  },
};

const headroom: NamedRule = {
  name: "authorization.available",
  fn: (ctx) => {
    const offer = offerOf(ctx);
    const auth = authOf(ctx);
    const available = availablePaise(auth);
    if (offer.totalPaise <= available) return null;
    return {
      code: "AUTHORIZATION_EXCEEDED",
      rule: "authorization.available",
      message: `Order of ${formatInr(offer.totalPaise)} exceeds the ${formatInr(available)} remaining on this authorization.`,
      observed: offer.totalPaise.toString(),
      expected: available.toString(),
    };
  },
};

const velocity: NamedRule = {
  name: "authorization.maxOrdersPerHour",
  fn: (ctx) => {
    const auth = authOf(ctx);
    // The count excludes the attempt being judged, so the limit is reached at equality.
    if (ctx.ordersLastHour < auth.maxOrdersPerHour) return null;
    return {
      code: "VELOCITY_EXCEEDED",
      rule: "authorization.maxOrdersPerHour",
      message: `Already ${ctx.ordersLastHour} orders in the last hour, against a limit of ${auth.maxOrdersPerHour}.`,
      observed: String(ctx.ordersLastHour),
      expected: String(auth.maxOrdersPerHour),
    };
  },
};

const inStock: NamedRule = {
  name: "catalog.inventory",
  fn: (ctx) => {
    const offer = offerOf(ctx);
    if (ctx.inventory >= offer.qty) return null;
    return {
      code: "OUT_OF_STOCK",
      rule: "catalog.inventory",
      message: `Only ${ctx.inventory} left, ${offer.qty} requested.`,
      observed: String(offer.qty),
      expected: String(ctx.inventory),
    };
  },
};

/** Ordered. The engine walks this top-down and stops at the first non-null. */
export const RULES: NamedRule[] = [
  agentActive,
  offerSignature,
  offerFresh,
  offerBelongsToAgent,
  offerUnused,
  claimMatchesOffer,
  authorizationConfirmed,
  authorizationFresh,
  skuInScope,
  perOrderCap,
  headroom,
  velocity,
  inStock,
];

export type { Reason };
