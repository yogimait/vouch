import type { ReactNode } from "react";
import Link from "next/link";
import type { PayView } from "@/core/db/overview/pay";
import { formatInr } from "@/core/money";
import { Big, Figure, Note, StatCard } from "@/app/(console)/cards";
import { asMoney, Field, Id, Outcome } from "@/app/(console)/ui";

const stamp = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * Outside the console shell: no dock, no viewport pin, one column at 640px. The card vocabulary is
 * the console's, but four across would put a merchant's legal name in an 80px column, so they stack.
 */
function Frame({ kicker, title, subtitle, children }: { kicker: string; title: ReactNode; subtitle: string; children: ReactNode }) {
  return (
    <main className="atmosphere min-h-dvh px-5 py-12 sm:px-8">
      <div className="page-enter mx-auto w-full max-w-[40rem]">
        <header className="mb-6">
          <p className="kicker">{kicker}</p>
          <h1 className="display-md mt-3 text-balance">{title}</h1>
          <p className="mt-2 max-w-[52ch] text-sm text-fg-2">{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  );
}

/** An id nobody issued is not the same failure as an order that never reached the gateway. */
export function Missing({ orderId }: { orderId: string }) {
  return (
    <Frame
      kicker="vouch / authorisation"
      title={<>No such <span className="em">order</span>.</>}
      subtitle="This link names an order this merchant did not issue, or one that has since been removed."
    >
      <section className="rounded-[3px] border border-dashed border-hairline px-6 py-10 text-center">
        <p className="font-mono text-xs break-all text-fg-3">{orderId}</p>
        <p className="mt-3 text-sm text-fg-2">Nothing has been charged, and nothing is held.</p>
      </section>
    </Frame>
  );
}

function Approving({ view }: { view: PayView }) {
  return (
    <StatCard title="What you are approving" index={0}>
      <Big value={formatInr(view.amountPaise)} caption={`${view.qty} × ${view.sku}`} />
      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Figure label="item" value={view.itemName} />
        <Figure label="unit price" value={formatInr(view.unitPricePaise)} />
        <Figure label="merchant" value={view.merchantLegalName} />
        <Figure label="signed offer expires" value={stamp(view.offerExpiresAt)} />
      </div>
      <Note>
        The merchant signed this price before the agent quoted it. The expiry fixed how long that
        signature could be spent — it gated admission, and it is not a deadline on this page.
      </Note>
    </StatCard>
  );
}

function Authority({ view }: { view: PayView }) {
  return (
    <StatCard title="Who asked, and on whose authority" index={1}>
      <Big value={view.agentName} caption={`acting for ${view.principalRef}`} className="text-[1.75rem]" />
      <div className="mt-3">
        <Field label="agent"><Id value={view.agentId} head={12} tail={6} /></Field>
        <Field label="granted_by">{view.grantedBy}</Field>
        <Field label="granted_via">{view.grantedVia}</Field>
        <Field label="granted_at">{stamp(view.grantedAt)}</Field>
        <Field label="mandate expires">{stamp(view.mandateExpireAt)}</Field>
        <Field label="max_per_order">{formatInr(view.maxPerOrderPaise)}</Field>
      </div>
      <Note>
        The authority is the mandate, not the agent. The agent holds no credential and never has —
        that is why the last step of a payment it started arrives in front of you.
      </Note>
    </StatCard>
  );
}

const WHY: Record<string, string> = {
  ESCALATE:
    "The agent was inside the merchant's policy and inside the scope its principal set. It asked for more than the ceiling that principal delegated to it, so the engine escalated rather than refused: the payment is legitimate, and only a person can authorise it.",
  ADMIT:
    "Every rule passed — the agent stayed inside its authority. What is left is the device step: Razorpay needs a credential to move money, and the agent holds none.",
  REFUSE:
    "The engine refused this attempt. Nothing here should be paid without checking why it exists.",
};

function Why({ view }: { view: PayView }) {
  return (
    <StatCard title="Why it reached you" index={2}>
      <div className="mt-3">
        {view.outcome ? <Outcome value={view.outcome} /> : <span className="font-mono text-xs text-fg-3">not recorded</span>}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-2">
        {view.outcome ? WHY[view.outcome] : "No decision row names this order, so the reason it reached you is not on the record."}
      </p>
      {view.reasons.map((reason) => (
        <div key={reason.code} className="mt-4 border-t border-hairline pt-3">
          <p className="font-mono text-xs text-escalate">{reason.code}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed">{reason.message}</p>
          {/* Both escalatable codes in the catalogue are money codes, so asMoney cannot mislabel a count. */}
          {reason.observed && (
            <div className="mt-3 flex gap-8">
              <Figure label="observed" value={asMoney(reason.observed)} tone="text-escalate" />
              <Figure label="expected" value={asMoney(reason.expected)} />
            </div>
          )}
        </div>
      ))}
      <Note>A gate record. It counts decisions, never money — the ledger below is the money.</Note>
    </StatCard>
  );
}

/** Available never moves on settlement: an admitted order already held it, an escalated one never did. */
function drawdown(view: PayView): string {
  if (view.state === "PAID") {
    return view.reservedHere
      ? "Settled. This order's hold became a debit, and it is inside the drawn-down figure above."
      : "Settled outside the mandate. It was escalated, so it took no hold and debited nothing — the authority for it was a person's, not the mandate's.";
  }
  return view.reservedHere
    ? `${formatInr(view.amountPaise)} is already held against this mandate — it left the available figure the moment the agent was admitted. Settling moves it from held to drawn down, so available does not fall a second time.`
    : `Nothing is held for this order. An escalation is beyond what the mandate delegated, so it reserves nothing and debits nothing when it settles: available stands at ${formatInr(view.availablePaise)} either way.`;
}

function Drawdown({ view }: { view: PayView }) {
  return (
    <StatCard title="What it draws down" index={3}>
      <Big value={formatInr(view.availablePaise)} caption="available on the mandate, before and after" />
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Figure label="ceiling" value={formatInr(view.maxAmountPaise)} />
        <Figure label="drawn down" value={formatInr(view.debitedPaise)} />
        <Figure label="held" value={formatInr(view.heldPaise)} />
      </div>
      <Note>{drawdown(view)}</Note>
    </StatCard>
  );
}

export function PayShell({ view, children }: { view: PayView; children: ReactNode }) {
  const escalated = view.outcome === "ESCALATE";
  const paid = view.state === "PAID";

  return (
    <Frame
      kicker={`${view.merchantName} / ${paid ? "settled" : escalated ? "approval required" : "authorisation"}`}
      title={
        paid ? <>This one is <span className="em">paid</span>.</>
          : escalated ? <>The agent could not <span className="em">authorise</span> this.</>
          : <>Authorise this <span className="em">payment</span>.</>
      }
      subtitle={
        paid ? "The money moved and the receipt is signed. Everything below is what was true when it did."
          : escalated ? "An AI buyer asked to spend more than its principal delegated to it. It stopped, and the decision is yours."
          : "An AI buyer was admitted to spend here. It holds no payment credential, so a person completes the step it cannot."
      }
    >
      <div className="flex flex-col gap-3">
        <Approving view={view} />
        <Authority view={view} />
        <Why view={view} />
        <Drawdown view={view} />
      </div>
      <section className="mt-3 rounded-[3px] border border-hairline p-4">{children}</section>
      <p className="mt-4 text-center font-mono text-[11px] text-fg-3">
        {view.orderId} · Razorpay test mode
      </p>
    </Frame>
  );
}

export function Settled({ orderId }: { orderId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-admit">Paid. Nothing further is owed.</p>
      <Link href={`/receipts/${orderId}`} className="feedback text-sm text-primary hover:underline">
        open the receipt
      </Link>
    </div>
  );
}

/** An order with no gateway order behind it. The gateway call failed, or the order never got there. */
export function Stalled({ state }: { state: string }) {
  return (
    <>
      <p className="text-sm text-fg-2">
        This order has no Razorpay order behind it, so there is nothing here to pay yet.
      </p>
      <p className="mt-2 font-mono text-xs text-fg-3">state: {state.toLowerCase()}</p>
    </>
  );
}
