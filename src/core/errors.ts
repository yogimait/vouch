// One catalogue drives the HTTP status, the message and whether a human can rescue the request.
// Append-only: a code that has appeared in a receipt must never change meaning.
//
// escalatable = the request is legitimate but exceeds THIS agent's delegated authority, so a human
// can complete it. Everything else is a refusal the agent itself must act on.

export const ERROR_CODES = {
  // agent
  AGENT_UNKNOWN: { http: 401, message: "Unknown agent credential." },
  AGENT_FROZEN: { http: 403, message: "Agent is frozen and may not spend." },

  // offer
  OFFER_SIGNATURE_INVALID: { http: 400, message: "Offer token signature is not valid." },
  OFFER_MALFORMED: { http: 400, message: "Offer token is malformed." },
  OFFER_WRONG_TYPE: { http: 400, message: "Token is not a Vouch offer." },
  OFFER_EXPIRED: { http: 409, message: "Offer has expired. Request a new quote." },
  OFFER_WRONG_AGENT: { http: 403, message: "Offer was issued to a different agent." },
  OFFER_ALREADY_USED: { http: 409, message: "Offer has already been used." },
  OFFER_UNKNOWN: { http: 404, message: "No such offer." },
  OFFER_DISCOUNT_UNKNOWN: { http: 400, message: "Unknown discount code. Agents select from merchant-approved offers only." },
  MISQUOTE: { http: 402, message: "Claimed total does not match the signed offer." },

  // authorization
  AUTHORIZATION_UNKNOWN: { http: 404, message: "No such authorization." },
  AUTHORIZATION_NOT_CONFIRMED: { http: 403, message: "Authorization is not confirmed." },
  AUTHORIZATION_EXPIRED: { http: 403, message: "Authorization has expired." },
  SKU_NOT_AUTHORIZED: { http: 403, message: "This item is outside the authorization's scope." },
  PER_ORDER_LIMIT_EXCEEDED: { http: 402, message: "Order exceeds the per-order limit.", escalatable: true },
  AUTHORIZATION_EXCEEDED: { http: 402, message: "Order exceeds the authorization's remaining amount.", escalatable: true },

  // pace and stock
  VELOCITY_EXCEEDED: { http: 429, message: "Too many orders in this window." },
  OUT_OF_STOCK: { http: 409, message: "Not enough stock." },

  // request
  INVALID_REQUEST: { http: 400, message: "Request body failed validation." },
  IDEMPOTENCY_CONFLICT: { http: 409, message: "This idempotency key was used with different terms." },
  ORDER_UNKNOWN: { http: 404, message: "No such order." },
  ORDER_NOT_SETTLED: { http: 409, message: "Order has not settled, so no receipt exists yet." },
  // Neither OFFER_EXPIRED nor AUTHORIZATION_EXPIRED covers this: those describe the inputs to
  // admission, and this is an order that was admitted and then aged out waiting to be paid.
  ORDER_EXPIRED: { http: 409, message: "This order passed its deadline and its hold was released." },
  ORDER_NOT_ESCALATED: { http: 409, message: "Only an escalation is waiting on a person's answer." },
  ORDER_CLOSED: { http: 409, message: "This order was closed without being paid." },
  RECEIPT_UNKNOWN: { http: 404, message: "No such receipt." },

  // infrastructure — every one of these must read as a refusal, never as an allow
  WEBHOOK_SIGNATURE_INVALID: { http: 401, message: "Webhook signature is not valid." },
  GATEWAY_UNAVAILABLE: { http: 502, message: "Payment gateway did not respond." },
  GUARD_UNAVAILABLE: { http: 500, message: "Admission engine could not reach a decision, so the request is refused." },
  DEMO_DISABLED: { http: 404, message: "The demo console is not enabled on this deployment." },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isEscalatable(code: ErrorCode): boolean {
  return "escalatable" in ERROR_CODES[code] && ERROR_CODES[code].escalatable === true;
}

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code].http;
}

export function messageFor(code: ErrorCode): string {
  return ERROR_CODES[code].message;
}
