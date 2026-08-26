"use client";

import { useState } from "react";
import Link from "next/link";
import type { TamperResult } from "@/demo/tamper";
import { TAMPER_TARGETS } from "@/demo/targets";
import { RunButton, Note } from "./panel";

export interface Settled { orderId: string; label: string }

export function ReceiptPanel({ settled }: { settled: Settled[] }) {
  const [orderId, setOrderId] = useState(settled[0]?.orderId ?? "");
  const [path, setPath] = useState<string>(TAMPER_TARGETS[0].path);
  const [value, setValue] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TamperResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null); setResult(null);
    const res = await fetch("/api/demo/tamper", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, path, value }),
    });
    const body = await res.json();
    if (body.data) setResult(body.data); else setError(body.error?.code ?? "failed");
    setBusy(false);
  }

  if (settled.length === 0) {
    return (
      <p className="text-sm text-fg-2">
        No settled order yet. Complete a purchase in act 03 first — a receipt exists only once money has moved.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="label">receipt</span>
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)}
            className="mt-1 w-full rounded border border-hairline bg-raised px-3 py-2 text-sm">
            {settled.map((s) => <option key={s.orderId} value={s.orderId}>{s.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">field to alter</span>
          <select value={path} onChange={(e) => setPath(e.target.value)}
            className="mt-1 w-full rounded border border-hairline bg-raised px-3 py-2 text-sm">
            {TAMPER_TARGETS.map((t) => <option key={t.path} value={t.path}>{t.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">change it to</span>
          <input value={value} onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded border border-hairline bg-raised px-3 py-2 font-mono text-sm" />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <RunButton onClick={run} busy={busy} tone="danger">Alter one field and re-verify</RunButton>
        {orderId && <Link href={`/receipts/${orderId}`} className="text-sm text-primary hover:underline">see the intact receipt</Link>}
      </div>

      {error && <p className="mt-4 text-sm text-refuse">{error}</p>}

      {result && (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded border border-admit/30 p-5">
            <div className="font-display text-xl text-admit">{result.before.valid ? "Verified" : "Does not verify"}</div>
            <p className="mt-2 text-sm text-fg-2">As stored and signed.</p>
            <p className="mt-3 font-mono text-xs text-fg-3">{result.path} = {result.was}</p>
          </div>
          <div className="rounded border border-refuse/40 p-5">
            <div className="font-display text-xl text-refuse">{result.after.valid ? "Verified" : "Does not verify"}</div>
            <p className="mt-2 text-sm">
              {result.after.tamperedBlocks.length
                ? <>altered block: <span className="font-mono text-refuse">{result.after.tamperedBlocks.join(", ")}</span></>
                : "signature no longer matches"}
            </p>
            <p className="mt-3 font-mono text-xs text-fg-3">{result.path} = {result.now}</p>
          </div>
        </div>
      )}

      <Note>
        Nothing is written back — the stored receipt is untouched. The verifier names the block because each
        of the six is hashed on its own, so a dispute reads &ldquo;the payment block was altered&rdquo; rather
        than &ldquo;signature invalid&rdquo;.
      </Note>
    </>
  );
}
