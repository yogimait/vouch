"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { BuyResult } from "@/demo/buy";
import { RunButton, Note, Step } from "./panel";

export interface Item { sku: string; name: string; category: string; price: string }

const OUTCOME = { ADMIT: "text-admit", ESCALATE: "text-escalate", REFUSE: "text-refuse" } as const;

type Confirmation = { status: string; paymentId?: string; receiptId?: string | null; releasedPaise?: string };

export function BuyPanel({ items }: { items: Item[] }) {
  const [sku, setSku] = useState(items[0]?.sku ?? "SKU-E");
  const [qty, setQty] = useState(1);
  const [discountCode, setDiscount] = useState("");
  const [claimed, setClaimed] = useState("");
  const [frozen, setFrozen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BuyResult | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `body.data ?? null` swallowed every refusal: DEMO_DISABLED landed as no result and no message.
  // try/finally, not a trailing setBusy, so a throw cannot leave the button disabled until a reload.
  async function run() {
    setBusy(true); setError(null);
    setResult(null);
    setConfirmed(null);
    try {
      const res = await fetch("/api/demo/buy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku, qty,
          discountCode: discountCode.trim() || null,
          claimedTotalPaise: claimed.trim() || null,
          agent: frozen ? "frozen" : "shopbot",
        }),
      });
      const body = await res.json();
      if (body.data) setResult(body.data);
      else setError(body.error?.code ?? body.message ?? "the run was refused");
    } catch {
      setError("the request never reached the server");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(orderId: string) {
    setBusy(true); setError(null);
    try {
      const body = await (await fetch(`/api/orders/${orderId}/confirm`, { method: "POST" })).json();
      if (body.data) setConfirmed(body.data);
      else setError(body.error?.code ?? body.message ?? "Razorpay could not be asked");
    } catch {
      setError("the request never reached the server");
    } finally {
      setBusy(false);
    }
  }

  const item = items.find((i) => i.sku === sku);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="label">item</span>
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="mt-1 w-full rounded-[2px] border border-hairline bg-raised px-3 py-2 text-sm"
          >
            {items.map((i) => (
              <option key={i.sku} value={i.sku}>{i.sku} · {i.name} · {i.price} · {i.category}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">quantity</span>
          <input
            type="number" min={1} max={20} value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 w-full rounded-[2px] border border-hairline bg-raised px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>

      <div className="mt-6 rounded-[2px] border border-dashed border-hairline p-4">
        <div className="label mb-3">the two places an agent could lie</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-fg-3">invent a discount code</span>
            <input
              value={discountCode} onChange={(e) => setDiscount(e.target.value)} placeholder="PARTNER25"
              className="mt-1 w-full rounded-[2px] border border-hairline bg-raised px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-fg-3">claim a total, in paise</span>
            <input
              value={claimed} onChange={(e) => setClaimed(e.target.value)} placeholder="100000"
              className="mt-1 w-full rounded-[2px] border border-hairline bg-raised px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs text-fg-3">
          <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} />
          act as the frozen agent instead
        </label>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <RunButton onClick={run} busy={busy}>Try to buy</RunButton>
        {item && <span className="text-sm text-fg-3">list price {item.price} each</span>}
      </div>

      {error && <p className="mt-4 font-mono text-xs text-refuse">{error}</p>}

      {result && (
        <div className="mt-8 border-t border-hairline pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className={`font-mono text-base tracking-wide ${OUTCOME[result.outcome]}`}>{result.outcome}</span>
            <span className="text-sm text-fg-2">{result.message}</span>
          </div>

          <ul className="mt-4">
            {result.steps.map((s, i) => <Step key={i} {...s} />)}
          </ul>

          {result.reasons.map((r, i) => (
            <div key={i} className="mt-4 rounded-[2px] border border-hairline p-4">
              <div className="font-mono text-xs text-refuse">{r.code}{r.rule ? ` · ${r.rule}` : ""}</div>
              <p className="mt-1 text-sm text-fg-2">{r.message}</p>
              {r.observed !== undefined && (
                <p className="mt-2 font-mono text-xs text-fg-3">observed {r.observed} · expected {r.expected}</p>
              )}
            </div>
          ))}

          {result.payUrl && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {/* The shared Button, not a hand-styled anchor: this is the control that spends money,
                  and it was the one control in the app not following the button rules. */}
              <Button asChild className="rounded-[2px]">
                <a href={result.payUrl} target="_blank" rel="noreferrer">
                  {result.outcome === "ESCALATE" ? "Open the link a human would get" : "Authorize this payment"}
                </a>
              </Button>
              <RunButton tone="quiet" busy={busy} onClick={() => confirm(result.orderId!)}>I have paid — check with Razorpay</RunButton>
            </div>
          )}

          {confirmed && (
            <div className="mt-4 text-sm">
              <span className={confirmed.status === "PAID" ? "text-admit" : "text-fg-2"}>{confirmed.status}</span>
              {confirmed.paymentId && <span className="ml-3 font-mono text-xs text-fg-3">{confirmed.paymentId}</span>}
              {confirmed.status === "PAID" && result.orderId && (
                <Link href={`/receipts/${result.orderId}`} className="ml-3 text-xs text-primary hover:underline">open the receipt</Link>
              )}
            </div>
          )}

          <Note>
            The price came back signed by the merchant. <span className="font-mono">pay</span> has no amount
            parameter, so whatever is typed above is a claim the server checks — never a price it accepts.
          </Note>
        </div>
      )}
    </>
  );
}
