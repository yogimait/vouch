// The authorization ledger. Append-only: RESERVE holds, COMMIT debits, RELEASE gives back.
// Nothing is ever updated, so the balances below are the only truth about what an agent has spent.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { authorizationLedger } from "@/core/db/schema";
import { newId } from "@/core/ids";
import { paiseFromSql } from "@/core/money";

export interface Balances {
  debitedPaise: bigint;
  heldPaise: bigint;
  availablePaise: bigint;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Per-authorization, not global: two agents drawing on different authorizations never contend.
 * hashtext is stable within a Postgres major version, which is all a lock key needs to be.
 */
async function lockAuthorization(tx: Tx, authorizationId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${authorizationId}))`);
}

/** The one place the balance formula lives. Cast ::text so the driver cannot round a bigint. */
async function readBalances(tx: Tx, authorizationId: string, maxAmountPaise: bigint): Promise<Balances> {
  const [row] = (await tx.execute(sql`
    select
      coalesce(sum(amount_paise) filter (where entry_type = 'COMMIT'), 0)::text  as committed,
      coalesce(sum(amount_paise) filter (where entry_type = 'RESERVE'), 0)::text as reserved,
      coalesce(sum(amount_paise) filter (where entry_type = 'RELEASE'), 0)::text as released
    from authorization_ledger where authorization_id = ${authorizationId}
  `)) as unknown as Record<string, string>[];

  const debitedPaise = paiseFromSql(row.committed);
  const held = paiseFromSql(row.reserved) - debitedPaise - paiseFromSql(row.released);
  const heldPaise = held > 0n ? held : 0n;
  const left = maxAmountPaise - debitedPaise - heldPaise;
  return { debitedPaise, heldPaise, availablePaise: left > 0n ? left : 0n };
}

export async function balances(authorizationId: string, maxAmountPaise: bigint): Promise<Balances> {
  return readBalances(getDb() as unknown as Tx, authorizationId, maxAmountPaise);
}

export interface ReserveInput {
  authorizationId: string;
  orderId: string;
  reservationId: string;
  amountPaise: bigint;
  maxAmountPaise: bigint;
  expiresAt: Date;
}

export type ReserveResult =
  | { ok: true; balances: Balances }
  | { ok: false; code: "AUTHORIZATION_EXCEEDED"; details: Record<string, string> };

/**
 * Lock first, then re-read. The engine already checked headroom, but it checked against a snapshot
 * taken outside the lock — two concurrent orders would both pass and together overdraw.
 */
export async function reserve(input: ReserveInput): Promise<ReserveResult> {
  return getDb().transaction(async (tx) => {
    await lockAuthorization(tx, input.authorizationId);
    const before = await readBalances(tx, input.authorizationId, input.maxAmountPaise);

    if (input.amountPaise > before.availablePaise) {
      return {
        ok: false as const,
        code: "AUTHORIZATION_EXCEEDED" as const,
        details: { observed: input.amountPaise.toString(), expected: before.availablePaise.toString() },
      };
    }

    await tx.insert(authorizationLedger).values({
      id: newId("ledger"),
      authorizationId: input.authorizationId,
      orderId: input.orderId,
      reservationId: input.reservationId,
      entryType: "RESERVE",
      amountPaise: input.amountPaise,
      expiresAt: input.expiresAt,
    });

    return { ok: true as const, balances: await readBalances(tx, input.authorizationId, input.maxAmountPaise) };
  });
}

/**
 * Settle or give back a reservation. Both are idempotent: a webhook can arrive twice, and the
 * unique index on (reservation_id, entry_type) is the backstop when this check races itself.
 */
async function settle(
  reservationId: string,
  entryType: "COMMIT" | "RELEASE",
): Promise<{ applied: boolean; amountPaise: bigint }> {
  return getDb().transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      select entry_type, amount_paise::text as amount, authorization_id, order_id
      from authorization_ledger where reservation_id = ${reservationId}
    `)) as unknown as Record<string, string>[];

    const held = rows.find((r) => r.entry_type === "RESERVE");
    if (!held) return { applied: false, amountPaise: 0n };
    if (rows.some((r) => r.entry_type === entryType)) {
      return { applied: false, amountPaise: paiseFromSql(held.amount) };
    }

    await lockAuthorization(tx, held.authorization_id);
    const amountPaise = paiseFromSql(held.amount);

    await tx.insert(authorizationLedger).values({
      id: newId("ledger"),
      authorizationId: held.authorization_id,
      orderId: held.order_id,
      reservationId,
      entryType,
      amountPaise,
    });

    return { applied: true, amountPaise };
  });
}

export const commit = (reservationId: string) => settle(reservationId, "COMMIT");
export const release = (reservationId: string) => settle(reservationId, "RELEASE");
