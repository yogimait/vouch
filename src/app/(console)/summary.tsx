"use client";

/**
 * Four content-rich cards and a full ledger do not both fit in 632px of console. Scrolling the page
 * would take the summary with it, so instead the cards fold — and the control sits in the heading
 * row, where it costs no height of its own. Measured: /metrics left the log 163px, about four rows.
 */

import { useSyncExternalStore, type ReactNode } from "react";

const KEY = "vouch.console.summary";
const listeners = new Set<() => void>();

/** A store, not useState: the choice has to survive moving between the four ledger pages. */
const store = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
  open: () => localStorage.getItem(KEY) !== "0",
  toggle() {
    localStorage.setItem(KEY, store.open() ? "0" : "1");
    listeners.forEach((l) => l());
  },
};

export function Summary({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  // Open is the server snapshot, so that is what renders without JS and what hydration matches.
  const open = useSyncExternalStore(store.subscribe, store.open, () => true);

  return (
    <>
      <header className="mb-5 flex shrink-0 items-start justify-between gap-6">
        <div>
          <h1 className="display-md">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={store.toggle}
          aria-expanded={open}
          className="feedback label shrink-0 rounded-[2px] border border-hairline px-3 py-1.5 hover:border-primary hover:text-primary"
        >
          {open ? "hide summary" : "show summary"}
        </button>
      </header>
      {open && children}
    </>
  );
}
