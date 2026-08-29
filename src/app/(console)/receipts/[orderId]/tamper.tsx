"use client";

/**
 * The same control the demo console has, on the receipt it is actually about. "The receipt is the
 * product" needs someone to break one here, in front of the six blocks, rather than on another page
 * against a receipt picked from a dropdown.
 */

import { useState } from "react";
import type { TamperResult } from "@/demo/tamper";
import { TAMPER_TARGETS } from "@/demo/targets";
import { Note, RunButton } from "../../demo/panel";

export function TamperControl({ orderId, enabled }: { orderId: string; enabled: boolean }) {
  const [path, setPath] = useState<string>(TAMPER_TARGETS[0].path);
  const [value, setValue] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TamperResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/demo/tamper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, path, value }),
      });
      const body = await res.json();
      if (body.data) setResult(body.data); else setError(body.error?.code ?? "failed");
    } catch {
      setError("the merchant did not answer");
    } finally {
      // Without the finally a thrown fetch leaves the button disabled until the page is reloaded.
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-[3px] border border-hairline p-6">
      <div className="label mb-1">try to break it</div>
      <p className="mb-5 text-sm text-fg-2">
        Alter one field and re-verify. Nothing is written back — the stored receipt is untouched.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">field to alter</span>
          <select value={path} onChange={(e) => setPath(e.target.value)} disabled={!enabled}
            className="mt-1 w-full rounded-[3px] border border-hairline bg-raised px-3 py-2 text-sm disabled:opacity-50">
            {TAMPER_TARGETS.map((t) => <option key={t.path} value={t.path}>{t.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">change it to</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} disabled={!enabled}
            className="mt-1 w-full rounded-[3px] border border-hairline bg-raised px-3 py-2 font-mono text-sm disabled:opacity-50" />
        </label>
      </div>

      <div className="mt-5">
        <RunButton onClick={run} busy={busy} tone="danger">Alter one field and re-verify</RunButton>
      </div>

      {!enabled && (
        <Note>
          Off on this deployment. Set <span className="font-mono">DEMO_CONSOLE=1</span> to enable it.
        </Note>
      )}
      {error && <p className="mt-4 text-sm text-refuse">{error}</p>}

      {result && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[3px] border border-admit/30 p-5">
            <div className="font-display text-xl text-admit">{result.before.valid ? "Verified" : "Does not verify"}</div>
            <p className="mt-2 text-sm text-fg-2">As stored and signed.</p>
            <p className="mt-3 font-mono text-xs text-fg-3">{result.path} = {result.was}</p>
          </div>
          <div className="rounded-[3px] border border-refuse/40 p-5">
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
        Each of the six blocks is hashed on its own, so a dispute reads &ldquo;the payment block was
        altered&rdquo; rather than &ldquo;signature invalid&rdquo;.
      </Note>
    </section>
  );
}
