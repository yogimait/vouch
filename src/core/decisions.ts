// Writing a decision down is one operation with a fixed order: the audit row first, then the row
// the console reads. Both the money path and the harness go through here, so a decision recorded by
// one is indistinguishable in shape from a decision recorded by the other — only `source` differs,
// and that is the field that keeps their numbers apart.
import { getDb } from "@/core/db";
import { decisions } from "@/core/db/schema";
import { newId } from "@/core/ids";
import { writeAudit } from "@/core/audit/log";
import type { AdmissionResult } from "@/core/engine/types";
import type { PaySource } from "@/core/orders/pay";

export interface DecisionRecord {
  agentId: string;
  source: PaySource;
  label?: string | null;
  result: AdmissionResult;
  offerId?: string | null;
  authorizationId?: string | null;
  orderId?: string | null;
  balanceBeforePaise?: bigint | null;
  policySnapshot?: Record<string, unknown>;
}

/** Audit first. Nothing downstream runs until both rows have landed. */
export async function recordDecision(r: DecisionRecord): Promise<string> {
  const decisionId = newId("decision");

  await writeAudit({
    eventType: "DECISION",
    actor: `agent:${r.agentId}`,
    agentId: r.agentId,
    orderId: r.orderId ?? null,
    payload: {
      decisionId,
      outcome: r.result.outcome,
      reasons: r.result.reasons,
      matchedRules: r.result.matchedRules,
      offerId: r.offerId ?? null,
      authorizationId: r.authorizationId ?? null,
      engineVersion: r.result.engineVersion,
    },
  });

  await getDb().insert(decisions).values({
    id: decisionId,
    agentId: r.agentId,
    orderId: r.orderId ?? null,
    offerId: r.offerId ?? null,
    authorizationId: r.authorizationId ?? null,
    outcome: r.result.outcome,
    reasons: r.result.reasons,
    matchedRules: r.result.matchedRules,
    escalatable: r.result.escalatable,
    policyVersion: r.result.policyVersion,
    policySnapshot: r.policySnapshot ?? {},
    authorizationBalanceBeforePaise: r.balanceBeforePaise ?? null,
    latencyMs: r.result.latencyMs,
    engineVersion: r.result.engineVersion,
    source: r.source,
    label: r.label ?? null,
  });

  return decisionId;
}
