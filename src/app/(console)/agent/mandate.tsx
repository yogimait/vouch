"use client";

import { CapacityBar } from "../authorizations/capacity-bar";
import type { Mandate } from "@/demo/agent";

/** The same bar the authorizations page draws, redrawn after every run so the drain is visible
 *  where the spending happened rather than one page away. */
export function MandateStrip({ mandate, agent }: { mandate: Mandate | null; agent: string }) {
  if (!mandate) {
    return <p className="text-sm text-refuse">{agent} holds no confirmed authorization. It cannot quote, let alone pay.</p>;
  }

  return (
    <CapacityBar
      maxPaise={BigInt(mandate.maxPaise)}
      debitedPaise={BigInt(mandate.debitedPaise)}
      heldPaise={BigInt(mandate.heldPaise)}
      availablePaise={BigInt(mandate.availablePaise)}
    />
  );
}
