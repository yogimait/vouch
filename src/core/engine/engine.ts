// The decision. Pure, synchronous, zero I/O. Three independent paths end in REFUSE, because an
// engine that cannot reach an answer must never read as permission.
import { isEscalatable } from "@/core/errors";
import { RULES } from "@/core/engine/rules";
import type { AdmissionContext, AdmissionResult, Outcome, Reason } from "@/core/engine/types";

export const ENGINE_VERSION = "vouch-engine-1";

function result(
  outcome: Outcome,
  reasons: Reason[],
  matchedRules: string[],
  policyVersion: number,
): AdmissionResult {
  return {
    outcome,
    reasons,
    matchedRules,
    escalatable: outcome === "ESCALATE",
    policyVersion,
    engineVersion: ENGINE_VERSION,
    latencyMs: 0,
  };
}

export function evaluate(ctx: AdmissionContext): AdmissionResult {
  const matchedRules: string[] = [];
  const policyVersion = ctx.policyVersion ?? 0;

  try {
    // Deny-by-default #1: a context assembled without an offer or an authorization must not read
    // as an allow. This runs before any rule, so there is one place it can be got wrong.
    if (!ctx.offer) {
      return result("REFUSE", [{
        code: "OFFER_UNKNOWN",
        rule: "context.offer",
        message: "No offer was resolved for this request.",
      }], matchedRules, policyVersion);
    }
    if (!ctx.authorization) {
      return result("REFUSE", [{
        code: "AUTHORIZATION_UNKNOWN",
        rule: "context.authorization",
        message: "No authorization was resolved for this request.",
      }], matchedRules, policyVersion);
    }

    for (const rule of RULES) {
      matchedRules.push(rule.name);
      const failure = rule.fn(ctx);
      if (!failure) continue;

      // The reason carries its own escalatability, so the flag lives with the rule that produced
      // it and there is no second place to look.
      const outcome: Outcome = isEscalatable(failure.code) ? "ESCALATE" : "REFUSE";
      return result(outcome, [failure], matchedRules, policyVersion);
    }

    return result("ADMIT", [], matchedRules, policyVersion);
  } catch {
    // Deny-by-default #2: a throwing rule, a malformed amount or a missing field all land here, and
    // every one of them has to read as a refusal rather than leak through as an admission.
    return result("REFUSE", [{
      code: "GUARD_UNAVAILABLE",
      rule: "engine",
      message: "Admission engine could not reach a decision, so the request is refused.",
    }], matchedRules, policyVersion);
  }
}
