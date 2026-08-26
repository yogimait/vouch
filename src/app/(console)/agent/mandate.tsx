"use client";

import type { AgentMandate } from "@/core/db/overview/agent";
import { formatInr } from "@/core/money";
import { Big, Figure, Note, StatCard } from "../cards";

interface Props { mandate: AgentMandate | null; frozen: boolean; reason: string | null }

/** The rupee card. Money is bigint paise rendered by formatInr, so it never gets a ticker. */
export function MandateCard({ mandate, frozen, reason }: Props) {
  if (!mandate) {
    return (
      <StatCard title="The mandate" index={0}>
        <p className="mt-4 text-sm text-refuse">
          No confirmed authorization. It cannot quote, let alone pay.
        </p>
      </StatCard>
    );
  }

  return (
    <StatCard title="The mandate" index={0}>
      {/* Frozen colours the headroom because the headroom is real and unreachable — the agent-status
          rule is the first the engine runs, so this money is never even consulted. */}
      <Big
        value={formatInr(BigInt(mandate.availablePaise))}
        tone={frozen ? "REFUSE" : "plain"}
        caption={frozen ? "authorized, and unreachable while frozen" : "left to spend"}
      />
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        <Figure label="per order" value={formatInr(BigInt(mandate.maxPerOrderPaise))} />
        <Figure label="orders / hour" value={String(mandate.maxOrdersPerHour)} />
        <Figure label="expires" value={mandate.expireAt} />
      </div>
      {frozen && <Note><span className="text-refuse">Frozen.</span> {reason ?? "No reason recorded."}</Note>}
    </StatCard>
  );
}
