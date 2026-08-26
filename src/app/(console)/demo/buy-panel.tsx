"use client";

import { useState } from "react";
import Link from "next/link";
import type { BuyResult } from "@/demo/buy";
import { Button, Note, Step } from "./panel";

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

  async function run() {
    setBusy(true);
    setResult(null);
    setConfirmed(null);
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
    setResult(body.data ?? null);
    setBusy(false);
  }

  async function confirm(orderId: string) {
    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}/confirm`, { method: "POST" });
    setConfirmed((await res.json()).data ?? null);
    setBusy(false);
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
            className="mt-1 w-full rounded border border-hairline bg-raised px-3 py-2 text-sm"
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
            className="mt-1 w-full rounded border border-hairline bg-raised px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>

      <div className="mt-6 rounded border border-dashed border-hairline p-4">
        <div className="label mb-3">the two places an agent could lie</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-fg-3">invent a discount code</span>
            <input
              value={discountCode} onChange={(e) => setDiscount(e.target.value)} placeholder="PARTNER25"
              className="mt-1 w-full rounded border border-hairline bg-raised px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-fg-3">claim a total, in paise</span>
            <input
              value={claimed} onChange={(e) => setClaimed(e.target.value)} placeholder="100000"
              className="mt-1 w-full rounded border border-hairline bg-raised px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs text-fg-3">
          <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} />
          act as the frozen agent instead
        </label>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Button onClick={run} busy={busy}>Try to buy</Button>
        {item && <span className="text-sm text-fg-3">list price {item.price} each</span>}
      </div>

      {result && (
        <div className="mt-8 border-t border-hairline pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className={`font-display text-2xl ${OUTCOME[result.outcome]}`}>{result.outcome}</span>
            <span className="text-sm text-fg-2">{result.message}</span>
          </div>

          <ul className="mt-4">
            {result.steps.map((s, i) => <Step key={i} {...s} />)}
          </ul>

          {result.reasons.map((r, i) => (
            <div key={i} className="mt-4 rounded border border-hairline p-4">
              <div className="font-mono text-xs text-refuse">{r.code}{r.rule ? ` · ${r.rule}` : ""}</div>
              <p className="mt-1 text-sm text-fg-2">{r.message}</p>
              {r.observed !== undefined && (
                <p className="mt-2 font-mono text-xs text-fg-3">observed {r.observed} · expected {r.expected}</p>
              )}
            </div>
          ))}

          {result.payUrl && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <a
                href={result.payUrl} target="_blank" rel="noreferrer"
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-black hover:bg-accent-bright"
              >
                {result.outcome === "ESCALATE" ? "Open the link a human would get" : "Authorize this payment"}
              </a>
              <Button tone="quiet" busy={busy} onClick={() => confirm(result.orderId!)}>I have paid — check with Razorpay</Button>
            </div>
          )}

          {confirmed && (
            <div className="mt-4 text-sm">
              <span className={confirmed.status === "PAID" ? "text-admit" : "text-fg-2"}>{confirmed.status}</span>
              {confirmed.paymentId && <span className="ml-3 font-mono text-xs text-fg-3">{confirmed.paymentId}</span>}
              {confirmed.status === "PAID" && result.orderId && (
                <Link href={`/receipts/${result.orderId}`} className="ml-3 text-xs text-accent hover:underline">open the receipt</Link>
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
