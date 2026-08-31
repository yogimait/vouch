"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OpsView } from "@/demo/ops";
import { Textarea } from "@/components/ui/textarea";
import { Big, Note, Quadrant, StatCard } from "../cards";
import { DemoGate, Empty, Outcome, ScrollPanel, type OutcomeValue } from "../ui";
import { Summary } from "../summary";
import { RunButton } from "../panel";
import { Step, type StepEvent } from "../agent/transcript";
import { ShelfRow } from "./shelf";
import { cn } from "@/lib/utils";

/**
 * One number, tuned on camera. A tick costs ~400ms, so the screen is never waiting on it — this is
 * paced for the viewer and for the model, which needs ~40s an errand and rate-limits if crossings
 * arrive faster than it can answer them.
 */
const TICK_MS = 4000;

export function LiveOps({ opening, enabled }: { opening: OpsView; enabled: boolean }) {
  const [view, setView] = useState(opening);
  const [paused, setPaused] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errand, setErrand] = useState<string | null>(null);
  const [asked, setAsked] = useState("");
  const [filing, setFiling] = useState(false);
  const [halted, setHalted] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  // A ref, not state: the interval closes over it, and putting it in the dependency array would
  // tear down and rebuild the timer on every tick.
  const inFlight = useRef(false);
  // One errand at a time. The queue backing up while the floor keeps falling is the honest picture,
  // and running two would race the claim and double the model bill.
  const running = useRef<string | null>(null);
  const source = useRef<EventSource | null>(null);

  const run = useCallback((id: string, need: string) => {
    running.current = id;
    setErrand(need);
    setSteps([]);

    const finish = () => { source.current?.close(); source.current = null; running.current = null; };
    const es = new EventSource(`/api/demo/ops/run?request=${encodeURIComponent(id)}`);
    source.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "step") setSteps((prior) => [...prior, data]);
      if (data.type === "done") { if (data.view) setView(data.view); setErrand(null); finish(); }
      if (data.type === "error") {
        // A provider quota is not a per-errand problem: every remaining shelf would hit the same
        // wall and print the same paragraph. Stop the floor and say so once.
        if (data.fatal) { setPaused(true); setHalted(data.message ?? null); }
        setErrand(null);
        finish();
      }
    };
    // Without this a dropped connection reconnects on its own and silently starts a second run.
    es.onerror = finish;
  }, []);

  const tick = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const body = await (await fetch("/api/demo/ops/tick", { method: "POST" })).json();
      if (!body.data) return;
      setView(body.data);

      // Oldest first: the queue is served in the order the shelves asked, so a viewer can follow it.
      const next = [...(body.data as OpsView).requests].reverse().find((r) => r.status === "OPEN");
      if (next && running.current === null) run(next.id, next.need);
    } catch {
      // A dropped tick is not an event. The next one is one TICK_MS away.
    } finally {
      inFlight.current = false;
    }
  }, [run]);

  // Closed on unmount, or a run keeps streaming — and billing — after the page is gone.
  useEffect(() => () => source.current?.close(), []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [paused, tick]);

  async function post(path: string, body?: unknown): Promise<void> {
    const res = await fetch(path, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const parsed = await res.json();
    if (parsed.data) setView(parsed.data);
  }

  async function reset() {
    setResetting(true);
    try { await post("/api/demo/ops/reset"); } finally { setResetting(false); }
  }

  async function file() {
    const need = asked.trim();
    if (!need) return;
    setFiling(true);
    try {
      await post("/api/demo/ops/request", { need });
      setAsked("");
    } finally {
      setFiling(false);
    }
  }

  const below = view.cupboard.filter((s) => s.below).length;
  const deepest = Math.max(1, ...view.warehouse.map((w) => w.onHand));
  const committed = view.warehouse.reduce((n, w) => n + w.committed, 0);

  return (
    <>
      {/* The cards belong inside Summary, like every other console page: hiding the summary has to
          give their height back to the panels. Outside it they simply sat there while the panels
          scrolled underneath them. */}
      <Summary
        title="Live"
        subtitle="Their supplies run down as their staff work. When a shelf crosses its reorder line their agent comes to our counter, and the guard answers before anything is signed."
      >
        <Quadrant>
          <StatCard title="their cupboard" index={0}>
            <Big value={below} caption={`of ${view.cupboard.length} shelves below the reorder line`} tone={below > 0 ? "REFUSE" : "plain"} />
          </StatCard>
          <StatCard title="our warehouse" index={1}>
            <Big value={committed} caption="units promised, not yet paid for" />
          </StatCard>
          <StatCard title="sent to the counter" index={2}>
            <Big value={view.raised} caption={`${view.answered} answered by the guard`} />
          </StatCard>
          <StatCard title="the mandate" index={3}>
            {/* A string, never a ticker: money does not count up. */}
            <Big value={view.mandateLeft ?? "—"} caption="left to spend" />
          </StatCard>
        </Quadrant>
      </Summary>

      <DemoGate enabled={enabled} />

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-4 border-y border-hairline py-2.5">
        <p className={cn("max-w-[60ch] text-sm", halted ? "text-escalate" : "text-fg-2")}>
          {halted ?? (paused ? "The floor is paused." : "Their staff are using things. Nobody is typing.")}
        </p>
        <div className="flex items-center gap-3">
          <RunButton onClick={() => { setHalted(null); setPaused((p) => !p); }} tone="quiet">
            {paused ? "Resume" : "Pause"}
          </RunButton>
          <RunButton onClick={reset} busy={resetting} tone="quiet">Refill the floor</RunButton>
        </div>
      </div>

      {/* One row, three panels, each scrolling inside itself. The console pins the viewport at lg,
          so a second row has no height to take — which is what pushed the cupboard behind the cards. */}
      <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-3">
        <ScrollPanel title="Their cupboard" count={view.cupboard.length} bodyClassName="p-4" className="mt-3 lg:mt-3">
          {view.cupboard.map((s) => (
            <ShelfRow key={s.id} name={s.name} value={s.onHand} of={s.startOnHand} mark={s.reorderLevel} alert={s.below} />
          ))}
          <Note>The thin line is the reorder level. Crossing it is what sends their agent to us — no prompt, no button.</Note>

          {/* The other trigger. Not every need has a shelf — a new starter's chair is asked for by a
              person, joins the same queue, and meets the same guard. */}
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="label">or someone asks for something</p>
            <Textarea
              value={asked}
              onChange={(e) => setAsked(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="A new starter needs a proper task chair for their desk."
              className="mt-2 bg-raised p-3 text-sm leading-relaxed"
            />
            <div className="mt-2 flex justify-end">
              <RunButton onClick={file} busy={filing} tone="quiet">File it</RunButton>
            </div>
          </div>
        </ScrollPanel>

        <ScrollPanel title="Our warehouse" count={view.warehouse.length} bodyClassName="p-4" className="mt-3 lg:mt-3">
          {view.warehouse.map((w) => (
            <ShelfRow key={w.sku} name={w.name} value={w.onHand} of={deepest} alert={w.onHand === 0}
                      right={w.committed > 0 ? `+${w.committed} held` : undefined} />
          ))}
          <Note>
            Bars are against our deepest line, not a target. Stock leaves on settlement, never on
            admission — until then the units are held, which is what &ldquo;held&rdquo; counts.
          </Note>
        </ScrollPanel>

        <ScrollPanel title="The counter" count={view.raised} className="mt-3 lg:mt-3">
          {errand && (
            <div className="border-b border-hairline bg-raised/40 px-4 py-3">
              <p className="text-sm text-fg-2">{errand}</p>
              {steps.length === 0
                ? <p className="mt-2 text-xs text-fg-3">Reading the catalogue. It was told what is needed, not which item to buy.</p>
                : <ol className="mt-2">{steps.map((s) => <Step key={s.index} step={s} />)}</ol>}
            </div>
          )}

          {view.requests.length === 0 && !errand
            ? <Empty title="Nothing has been asked for yet." hint="Wait for a shelf to cross its reorder line — the first one is a few seconds away." />
            : view.requests.map((r) => <Request key={r.id} row={r} />)}
        </ScrollPanel>
      </div>
    </>
  );
}

function Request({ row }: { row: OpsView["requests"][number] }) {
  const closed = row.status === "CLOSED" && row.outcome === null;
  // Three different things used to render as "not answered". Only one of them is a failure.
  const notPriced = closed && row.quoteRefusal !== null;
  const failed = closed && row.quoteRefusal === null;
  // ADMIT is the guard letting it through, not anyone being paid. Goods land when the order settles.
  const promised = (row.outcome === "ADMIT" || row.outcome === "ESCALATE") && row.deliveredAt === null;

  return (
    <div className="border-b border-hairline px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <span className="w-14 shrink-0 font-mono text-[10px] text-fg-3">{row.source === "STAFF" ? "person" : "cupboard"}</span>
        <span className="flex-1 text-sm text-fg-2">{row.need}</span>
        <span className="shrink-0 text-right">
          {row.outcome
            ? <Verdict outcome={row.outcome} orderId={row.orderId} />
            : notPriced
              ? <span className="font-mono text-[10px] text-escalate">not priced</span>
              : <span className={cn("font-mono text-[10px]", failed ? "text-refuse" : "text-fg-3")}>
                  {failed ? "not answered" : row.status === "RUNNING" ? "working…" : "queued"}
                </span>}
        </span>
      </div>
      {/* Said out loud rather than hidden behind a hover: a refusal the guard made and a call that
          never arrived look identical otherwise, and only one of them is the product working. */}
      {promised && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-fg-3">
          Admitted, not yet paid. The shelf fills when the order settles and its receipt is signed —
          our own stock does not move before then either.
        </p>
      )}
      {notPriced && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-escalate/80">
          <span className="font-mono">{row.quoteRefusal}</span>
          {" — the merchant would not sign a price for it, so the engine was never asked."}
        </p>
      )}
      {failed && row.words && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-refuse/70">{row.words}</p>
      )}
    </div>
  );
}

/**
 * The verdict, and the way out of it. An admitted order still needs a person to pay it and an
 * escalated one needs a person to allow it, so the badge links to the page where they do — without
 * it the counter answers a question and then goes nowhere.
 */
function Verdict({ outcome, orderId }: { outcome: string; orderId: string | null }) {
  const badge = <Outcome value={outcome as OutcomeValue} />;
  return orderId
    ? <Link href={`/pay/${orderId}`} className="feedback hover:underline">{badge}</Link>
    : badge;
}
