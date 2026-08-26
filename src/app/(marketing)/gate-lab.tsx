"use client";

/**
 * The engine, running in the visitor's browser. It can only be here because src/core/engine imports
 * nothing but the error catalogue and the money helpers — the ESLint rule that bans node:crypto and
 * the database from that folder is what makes the same 13 rules shippable to a landing page.
 *
 * Nothing here is recorded. It decides a hypothetical offer and writes no row, so no number on
 * /decisions or /metrics can move because someone dragged a slider.
 */

import { useMemo, useState, type ReactNode } from "react";
import type { GateFacts } from "@/core/db/queries";
import { evaluate } from "@/core/engine/engine";
import { RULES } from "@/core/engine/rules";
import type { AdmissionContext, AdmissionResult } from "@/core/engine/types";
import { formatInr } from "@/core/money";
import { cn } from "@/lib/utils";
import { TONE } from "../(console)/format";

const MAX_QTY = 6;

const CAPTION = {
  ADMIT: "inside its authority",
  ESCALATE: "beyond what was delegated",
  REFUSE: "with a code it can act on",
} as const;

/** The offer the agent never gets to write itself: the price is unit × qty, off the catalogue row. */
function contextFor(facts: GateFacts, sku: string, qty: number): AdmissionContext {
  const now = new Date();
  const item = facts.items.find((i) => i.sku === sku) ?? facts.items[0];
  const unit = BigInt(item.unitPricePaise);

  return {
    now,
    agent: { id: facts.agentId, status: facts.agentStatus },
    offer: {
      id: "offer_hypothetical",
      agentId: facts.agentId,
      authorizationId: facts.authorizationId,
      sku: item.sku,
      category: item.category,
      qty,
      unitPricePaise: unit,
      totalPaise: unit * BigInt(qty),
      expiresAt: new Date(now.getTime() + 120_000),
      signatureValid: true,
      consumedAt: null,
    },
    authorization: {
      id: facts.authorizationId,
      status: facts.authStatus,
      maxAmountPaise: BigInt(facts.maxAmountPaise),
      maxPerOrderPaise: BigInt(facts.maxPerOrderPaise),
      maxOrdersPerHour: facts.maxOrdersPerHour,
      allowedCategories: facts.allowedCategories,
      allowedSkus: facts.allowedSkus,
      expireAt: new Date(facts.expireAt),
      debitedPaise: BigInt(facts.debitedPaise),
      heldPaise: BigInt(facts.heldPaise),
    },
    claimedTotalPaise: null,
    ordersLastHour: facts.ordersLastHour,
    inventory: item.inventory,
    policySnapshot: {},
    policyVersion: 1,
  };
}

/**
 * It owns the two-column grid rather than sitting in one, and the section heading arrives as
 * children. The ladder is thirteen rows tall, so hanging it off the panel left the heading column
 * empty for six hundred pixels — the exact hole this was added to fill.
 */
export function GateLab({ facts, children }: { facts: GateFacts; children: ReactNode }) {
  // The second chip, not the first: the cheapest row admits at every quantity, so opening on it
  // makes the slider look inert. This one crosses a ceiling inside the slider's range.
  const [sku, setSku] = useState(facts.items[1]?.sku ?? facts.items[0]?.sku ?? "");
  const [qty, setQty] = useState(1);

  // Re-runs on every drag. It is synchronous and does no I/O, so there is nothing to debounce.
  const { result, total } = useMemo(() => {
    const ctx = contextFor(facts, sku, qty);
    return { result: evaluate(ctx), total: ctx.offer!.totalPaise };
  }, [facts, sku, qty]);

  return (
    <div className="lg:grid lg:grid-cols-[29rem_minmax(0,1fr)] lg:items-center lg:gap-16">
      {/* Desktop only. The panel leads and the heading answers it, rather than the other way round:
          the thing a visitor can touch should be the thing they reach first. */}
      <div className="hidden lg:block">
        <Panel facts={facts} sku={sku} setSku={setSku} qty={qty} setQty={setQty} result={result} total={total} />
        <Ladder result={result} />
      </div>
      {/* Lifted off the optical centre: the panel's own kicker sits above its border, so centring
          the two boxes left the heading reading a touch low against it. */}
      <div className="lg:-translate-y-7">{children}</div>
    </div>
  );
}

interface PanelProps {
  facts: GateFacts;
  sku: string;
  setSku: (sku: string) => void;
  qty: number;
  setQty: (qty: number) => void;
  result: AdmissionResult;
  total: bigint;
}

function Panel({ facts, sku, setSku, qty, setQty, result, total }: PanelProps) {
  const tone = TONE[result.outcome];
  const reason = result.reasons[0];

  return (
    <div className="rounded-[3px] border border-hairline bg-card p-5">
      <p className="kicker">{"// a hypothetical offer, judged by the live engine"}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {facts.items.map((item) => (
          <button
            key={item.sku}
            type="button"
            onClick={() => setSku(item.sku)}
            title={`${item.name} · ${formatInr(BigInt(item.unitPricePaise))}`}
            className={cn(
              "feedback rounded-full border border-hairline px-3 py-1 font-mono text-[11px]",
              item.sku === sku ? "border-primary/60 bg-primary/10 text-primary" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {item.sku}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-4">
        <label htmlFor="gate-qty" className="label shrink-0">quantity</label>
        <input
          id="gate-qty"
          type="range"
          min={1}
          max={MAX_QTY}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="h-[3px] flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-primary"
        />
        <span className="w-6 shrink-0 text-right font-mono text-sm tabular-nums">{qty}</span>
      </div>

      <div className="mt-6 flex items-end justify-between gap-6 border-t border-hairline pt-5">
        <div>
          <div
            data-testid="gate-outcome"
            className={cn("font-display text-[2.5rem] leading-none tracking-[-0.05em]", tone.text)}
          >
            {result.outcome}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{CAPTION[result.outcome]}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="label">it would ask for</div>
          <div data-testid="gate-total" className="mt-1 font-mono text-lg tabular-nums">{formatInr(total)}</div>
        </div>
      </div>

      {reason && (
        <div
          className="mt-4 rounded-[2px] border-l-2 px-3 py-2"
          style={{ borderLeftColor: `var(--${result.outcome.toLowerCase()})` }}
        >
          <div className={cn("font-mono text-xs", tone.text)}>{reason.code}</div>
          {reason.observed && (
            <div className="mt-1 font-mono text-xs text-fg-3">
              asked {money(reason.observed)} · limit {money(reason.expected)}
            </div>
          )}
        </div>
      )}

      <p className="mt-5 border-t border-hairline pt-3 text-[11px] leading-relaxed text-fg-3">
        Decided in this tab, against the real ceiling. Nothing is recorded.
      </p>
    </div>
  );
}

/** First match wins, so the rules under the one that fired were never run. The list has to say so. */
function Ladder({ result }: { result: AdmissionResult }) {
  const fired = result.reasons[0]?.rule ?? null;
  const checked = new Set(result.matchedRules);
  const hue = `var(--${result.outcome.toLowerCase()})`;

  return (
    <div className="mt-5">
      <p className="label">first match wins</p>
      <ol className="mt-3 grid grid-cols-2 gap-x-6">
        {RULES.map((rule) => {
          const isFired = rule.name === fired;
          const ran = checked.has(rule.name);

          return (
            <li key={rule.name} className="flex items-center gap-2 py-[3px]">
              <span
                className={cn("h-px flex-none transition-all duration-[450ms] ease-overshoot", isFired ? "w-5" : "w-2")}
                style={{ background: isFired ? hue : "rgba(255,255,255,0.16)" }}
              />
              <span
                className={cn(
                  "truncate font-mono text-[11px] transition-colors duration-[80ms]",
                  isFired ? "text-fg-white" : ran ? "text-fg-3" : "text-fg-3/40",
                )}
              >
                {rule.name}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Said once, in a sentence, rather than as a badge on every row: the names are long enough
          that an inline label truncated the very rule the reader is looking for. */}
      <p className="mt-3 text-[11px] leading-relaxed text-fg-3">
        {fired
          ? <>Caught at <span className="font-mono" style={{ color: hue }}>{fired}</span>. The {RULES.length - checked.size} below it never ran.</>
          : <>All {RULES.length} ran. Nothing matched, so the offer is admitted.</>}
      </p>
    </div>
  );
}

/** Reason values carry paise as strings; anything else (a category list, a count) is left alone. */
function money(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return String(value ?? "—");
  return formatInr(BigInt(value));
}
