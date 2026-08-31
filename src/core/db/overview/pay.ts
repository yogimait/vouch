// Read model for /pay/[orderId] — the only screen a paying human ever sees, so it carries the whole
// story: what is being bought, who asked, on whose authority, why it reached a person, and what the
// mandate has left. One statement, not several concurrent ones: this is a single row and every join
// hangs off the order's own foreign keys. Money is cast ::text so the driver cannot round it.
import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import type { DecisionReason } from "@/core/db/schema";
import type { OrderState } from "@/core/orders/state";
import { paiseFromSql } from "@/core/money";

export interface PayView {
  orderId: string;
  state: OrderState;
  amountPaise: bigint;
  /** Null until the gateway order exists. An order in that state cannot be paid on this page. */
  razorpayOrderId: string | null;
  razorpayKeyId: string;

  sku: string;
  qty: number;
  itemName: string;
  unitPricePaise: bigint;
  offerExpiresAt: Date;
  /** The order's own deadline. After this its hold goes back and it cannot be paid. */
  expiresAt: Date;
  merchantName: string;
  merchantLegalName: string;

  agentId: string;
  agentName: string;
  principalRef: string;
  grantedBy: string;
  grantedVia: string;
  grantedAt: Date;
  mandateExpireAt: Date;
  maxPerOrderPaise: bigint;

  /** Null when no decision row names this order — the honest reading is "not recorded", not ADMIT. */
  outcome: "ADMIT" | "ESCALATE" | "REFUSE" | null;
  reasons: DecisionReason[];

  maxAmountPaise: bigint;
  debitedPaise: bigint;
  heldPaise: bigint;
  availablePaise: bigint;
  /** ESCALATE never reserves, so an escalated order holds nothing and debits nothing on settling. */
  reservedHere: boolean;
}

type Row = Record<string, unknown>;

export async function payView(orderId: string): Promise<PayView | null> {
  const rows = (await getDb().execute(sql`
    select
      o.id, o.state, o.razorpay_order_id, o.expires_at,
      o.amount_paise::text as amount,
      f.sku, f.qty, f.expires_at as offer_expires_at,
      f.unit_price_paise::text as unit_price,
      coalesce(c.name, f.sku) as item_name,
      m.name as merchant_name, m.legal_name, m.razorpay_key_id,
      g.id as agent_id, g.name as agent_name, g.principal_ref,
      a.granted_by, a.granted_via, a.granted_at, a.expire_at as mandate_expire_at,
      a.max_amount_paise::text as max_amount,
      a.max_per_order_paise::text as max_per_order,
      d.outcome, coalesce(d.reasons, '[]'::jsonb) as reasons,
      coalesce(l.debited, 0)::text as debited,
      coalesce(l.reserved, 0)::text as reserved,
      coalesce(l.released, 0)::text as released,
      -- reservation_id IS the order id (see core/orders/pay.ts), so this is "did this order hold".
      exists (
        select 1 from authorization_ledger
        where reservation_id = o.id and entry_type = 'RESERVE'
      ) as reserved_here
    from orders o
    join offers f on f.id = o.offer_id
    join merchants m on m.id = f.merchant_id
    join buyer_agents g on g.id = o.agent_id
    join authorizations a on a.id = o.authorization_id
    left join catalog_items c on c.sku = f.sku
    left join lateral (
      select
        sum(amount_paise) filter (where entry_type = 'COMMIT')  as debited,
        sum(amount_paise) filter (where entry_type = 'RESERVE') as reserved,
        sum(amount_paise) filter (where entry_type = 'RELEASE') as released
      from authorization_ledger where authorization_id = a.id
    ) l on true
    -- One decision per order today, but ordered anyway: the newest is the one that sent it here.
    left join lateral (
      select outcome, reasons from decisions
      where order_id = o.id order by created_at desc limit 1
    ) d on true
    where o.id = ${orderId}
  `)) as unknown as Row[];

  const r = rows[0];
  if (!r) return null;

  const debitedPaise = paiseFromSql(r.debited);
  const held = paiseFromSql(r.reserved) - debitedPaise - paiseFromSql(r.released);
  const heldPaise = held > 0n ? held : 0n;
  const maxAmountPaise = paiseFromSql(r.max_amount);
  const left = maxAmountPaise - debitedPaise - heldPaise;

  return {
    orderId: String(r.id),
    state: r.state as OrderState,
    amountPaise: paiseFromSql(r.amount),
    razorpayOrderId: r.razorpay_order_id === null ? null : String(r.razorpay_order_id),
    razorpayKeyId: String(r.razorpay_key_id),

    sku: String(r.sku),
    qty: Number(r.qty),
    itemName: String(r.item_name),
    unitPricePaise: paiseFromSql(r.unit_price),
    offerExpiresAt: new Date(r.offer_expires_at as Date),
    expiresAt: new Date(r.expires_at as Date),
    merchantName: String(r.merchant_name),
    merchantLegalName: String(r.legal_name),

    agentId: String(r.agent_id),
    agentName: String(r.agent_name),
    principalRef: String(r.principal_ref),
    grantedBy: String(r.granted_by),
    grantedVia: String(r.granted_via),
    grantedAt: new Date(r.granted_at as Date),
    mandateExpireAt: new Date(r.mandate_expire_at as Date),
    maxPerOrderPaise: paiseFromSql(r.max_per_order),

    outcome: r.outcome === null ? null : (String(r.outcome) as PayView["outcome"]),
    reasons: (r.reasons as DecisionReason[]) ?? [],

    maxAmountPaise,
    debitedPaise,
    heldPaise,
    availablePaise: left > 0n ? left : 0n,
    reservedHere: r.reserved_here === true,
  };
}
