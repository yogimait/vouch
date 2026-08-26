"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./panel";

/** Destructive: it truncates and reseeds. Confirmed once, because a demo is re-run a lot. */
export function ResetButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function reset() {
    if (!confirm("Wipe every decision, order and receipt, and reseed?")) return;
    setBusy(true);
    await fetch("/api/demo/reset", { method: "POST" });
    router.refresh();
    setBusy(false);
  }

  return <Button onClick={reset} busy={busy} tone="quiet">Reset to the seed</Button>;
}
