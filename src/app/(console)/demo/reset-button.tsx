"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RunButton } from "./panel";

/** Destructive: it truncates and reseeds. Confirmed once, because a demo is re-run a lot. */
export function ResetButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function reset() {
    if (!confirm("Wipe every decision, order and receipt, and reseed?")) return;
    setBusy(true); setError(null);
    try {
      const body = await (await fetch("/api/demo/reset", { method: "POST" })).json();
      // The response was thrown away before, so a refused reset looked exactly like a successful one.
      if (body.status) router.refresh();
      else setError(body.error?.code ?? body.message ?? "the reset was refused");
    } catch {
      setError("the request never reached the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="font-mono text-xs text-refuse">{error}</span>}
      <RunButton onClick={reset} busy={busy} tone="quiet">Reset to the seed</RunButton>
    </div>
  );
}
