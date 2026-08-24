// INR has 2 decimals, so Rs 3,500.00 is 350000n paise. No float ever touches a money value.

export const PAISE_DECIMALS = 2;
const SCALE = 10n ** BigInt(PAISE_DECIMALS);

const AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;

/** "3500.00" -> 350000n. Rejects floats, negatives, exponents and sub-paise precision. */
export function toPaise(rupees: string): bigint {
  const match = AMOUNT.exec(rupees.trim());
  if (!match) throw new Error(`Invalid INR amount: ${JSON.stringify(rupees)}`);
  const [, whole, fraction = ""] = match;
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(PAISE_DECIMALS, "0"));
}

/** 350000n -> "3500.00" */
export function toRupees(paise: bigint): string {
  if (paise < 0n) throw new Error(`Negative money value: ${paise}`);
  return `${paise / SCALE}.${(paise % SCALE).toString().padStart(PAISE_DECIMALS, "0")}`;
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** 350000n -> "₹3,500.00" with lakh grouping. */
export function formatInr(paise: bigint): string {
  return INR.format(Number(toRupees(paise)));
}

/** Razorpay's API takes a JS number. This is the only place a bigint may become one. */
export function toRazorpayAmount(paise: bigint): number {
  if (paise < 0n) throw new Error(`Negative money value: ${paise}`);
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Amount exceeds safe integer: ${paise}`);
  return Number(paise);
}

/** Postgres returns aggregates as text so the driver cannot round them. */
export function paiseFromSql(value: unknown): bigint {
  return BigInt(String(value ?? 0));
}

export { SCALE };
