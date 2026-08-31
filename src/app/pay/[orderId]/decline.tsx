"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The other half of an escalation. Approving one is a payment; refusing one used to be closing the
 * tab, which the record could not tell apart from a deadline passing.
 */
export function Decline({ orderId }: { orderId: string }) {
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function decline() {
    setBusy(true);
    try {
      await fetch(`/api/orders/${orderId}/decline`, { method: "POST" });
      // The page's own facts are now stale: it renders the closed state itself.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Two clicks, because it is terminal. A misplaced click must not close a legitimate purchase.
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
      <p className="text-sm text-fg-2">
        {asked
          ? "This closes the order for good. The agent will have to ask again."
          : "Not something this business wants bought?"}
      </p>
      <div className="flex items-center gap-3">
        {asked && (
          <button type="button" onClick={() => setAsked(false)}
                  className="feedback rounded-[3px] border border-hairline px-3 py-1.5 text-sm hover:border-primary hover:text-primary">
            Keep it open
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => (asked ? decline() : setAsked(true))}
          className="feedback rounded-[3px] border border-refuse/50 px-3 py-1.5 text-sm text-refuse hover:border-refuse disabled:opacity-50"
        >
          {busy ? "Declining…" : asked ? "Yes, decline it" : "Decline"}
        </button>
      </div>
    </div>
  );
}
