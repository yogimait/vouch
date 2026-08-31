// Prefixed ULIDs so every id says what it is in a log line, and sorts by creation time.
import { ulid } from "ulid";

export const ID_PREFIX = {
  merchant: "mrc",
  agent: "agt",
  authorization: "auth",
  offer: "off",
  order: "ord",
  decision: "dec",
  ledger: "led",
  receipt: "rcp",
  audit: "aud",
  webhook: "whk",
  misquote: "msq",
  cupboard: "cup",
  request: "req",
} as const;

export type IdKind = keyof typeof ID_PREFIX;

/** newId("order") -> "ord_01J9ZQ2V8K3M..." */
export function newId(kind: IdKind): string {
  return `${ID_PREFIX[kind]}_${ulid()}`;
}

/** Cheap shape check for route params, so a malformed id fails before it reaches the DB. */
export function isId(kind: IdKind, value: string): boolean {
  return value.startsWith(`${ID_PREFIX[kind]}_`) && value.length === ID_PREFIX[kind].length + 27;
}
