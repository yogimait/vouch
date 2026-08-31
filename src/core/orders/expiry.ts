// How long an admitted order has before its hold goes back. Two windows, because the two things
// waiting are not alike.

/** A machine that was admitted has minutes: nobody is reading, and the hold is real money. */
export const HOLD_WINDOW_MS = 15 * 60_000;

/** An escalation waits on a person, who may be asleep. It holds nothing, so it can afford to wait. */
export const APPROVAL_WINDOW_MS = 24 * 60 * 60_000;
