// Its own module because the console imports it as a value. Anything reachable from a client
// component drags its whole import graph into the browser bundle, and tamper.ts reaches the database.

/** The fields worth breaking on camera: each one is a different dispute answer. */
export const TAMPER_TARGETS = [
  { path: "blocks.payment.amount_paise", label: "the amount that was charged", block: "payment" },
  { path: "blocks.decision.outcome", label: "whether the agent was allowed", block: "decision" },
  { path: "blocks.offer.total_paise", label: "the price the merchant signed", block: "offer" },
  { path: "blocks.authorization.max_amount_paise", label: "how much the human authorised", block: "authorization" },
  { path: "blocks.audit.head_hash", label: "where it sits in the chain", block: "audit" },
] as const;
