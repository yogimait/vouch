"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AgentOverview } from "@/core/db/overview/agent";
import type { Preset } from "@/demo/instructions";
import { Empty, ScrollPanel } from "../ui";
import { AgentCards, type RunResult } from "./cards";
import { ChipGroup } from "./chips";
import { Step, type StepEvent } from "./transcript";
import { Decisions } from "./decisions";

interface Run { model: string; temperature: number; agent: string }

const WHO = [
  { id: "shopbot", label: "ShopBot" },
  { id: "frozen", label: "FrozenBot" },
];

const NO_RUNS: RunResult[] = [];

export function AgentConsole({ presets, overviews }: { presets: Preset[]; overviews: Record<string, AgentOverview> }) {
  const [instruction, setInstruction] = useState(presets[0].instruction);
  const [who, setWho] = useState("shopbot");
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  // Keyed by agent: switching the chip must not show ShopBot's spending on FrozenBot's card.
  const [history, setHistory] = useState<Record<string, RunResult[]>>({});
  // The cards count every run; the panel below only ever shows the transcript's own.
  const [shown, setShown] = useState<RunResult | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const source = useRef<EventSource | null>(null);

  function stop() {
    source.current?.close();
    source.current = null;
    setRunning(false);
  }

  function start() {
    stop();
    setSteps([]); setVerdict(null); setOrderId(null); setRun(null); setShown(null); setRunning(true);

    // Captured now, so a chip clicked mid-run cannot file this run's rows under the other agent.
    const acting = who;
    const es = new EventSource(`/api/demo/agent?agent=${acting}&instruction=${encodeURIComponent(instruction)}`);
    source.current = es;
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "start") setRun({ model: data.model, temperature: data.temperature, agent: data.agent });
      if (data.type === "step") setSteps((prior) => [...prior, data]);
      if (data.type === "done") {
        const result: RunResult = {
          mandate: data.mandate ?? null,
          decisions: data.decisions ?? [],
          misquotes: data.misquotes ?? [],
        };
        setShown(result);
        setHistory((prior) => ({ ...prior, [acting]: [...(prior[acting] ?? []), result] }));
        setOrderId(data.orderId ?? null);
        setVerdict(data.text || "finished without a closing statement");
        stop();
      }
      if (data.type === "error") { setVerdict(`failed: ${data.message}`); stop(); }
    };
    // Without this a dropped connection reconnects on its own and silently starts a second run.
    es.onerror = () => stop();
  }

  const misquotes = shown?.misquotes ?? [];
  const decisions = shown?.decisions ?? [];

  return (
    <>
      <AgentCards overview={overviews[who]} runs={history[who] ?? NO_RUNS} />

      <div className="mt-4 shrink-0">
        <ChipGroup label="acting as" chips={WHO} selected={who} onSelect={setWho} />
        <ChipGroup
          label="try"
          chips={presets.map((p) => ({ id: p.instruction, label: p.label, hint: p.expect }))}
          selected={instruction}
          onSelect={setInstruction}
        />

        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Tell the agent what to buy."
          className="bg-raised p-4 text-sm leading-relaxed"
        />

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Button
            type="button"
            onClick={running ? stop : start}
            disabled={!instruction.trim()}
            variant={running ? "outline" : "default"}
            className="rounded-full"
          >
            {running ? "Stop" : "Send it"}
          </Button>
          {run && <span className="font-mono text-xs text-fg-3">{run.model} · temperature {run.temperature}</span>}
          {running && <span className="text-xs text-fg-3">working…</span>}
        </div>
      </div>

      <ScrollPanel title="its reasoning, its tool calls, and the merchant's answers" count={steps.length}>
        {/* ScrollPanel hides its own overflow for a DataTable that scrolls itself; this is that scroller. */}
        <div className="px-4 py-4 lg:h-full lg:overflow-y-auto">
          {steps.length === 0 && !verdict ? (
            <Empty title="Nothing has run yet." hint="Pick an errand above, or write your own, then press Send it." />
          ) : (
            <ol>{steps.map((s) => <Step key={s.index} step={s} />)}</ol>
          )}

          {decisions.length > 0 && <Decisions rows={decisions} />}

          {misquotes.length > 0 && (
            <Card className="mt-8 gap-0 border-refuse/40 p-5">
              <div className="label mb-3 text-refuse">it tried to state a price the merchant never signed · {misquotes.length}</div>
              {misquotes.map((m, i) => (
                <div key={i} className="border-t border-hairline py-3 first:border-t-0 first:pt-0">
                  <span className="font-mono text-xs">{m.kind}</span>
                  {m.code && <span className="ml-3 text-sm">invented <span className="font-mono text-refuse">{m.code}</span></span>}
                  {m.claimed && <span className="ml-3 text-sm">claimed {m.claimed} against a signed {m.signed}</span>}
                </div>
              ))}
            </Card>
          )}

          {verdict && (
            <section className="mt-8">
              <Separator className="mb-6" />
              <div className="label mb-2">what it reported back</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-2">{verdict}</p>
              <div className="mt-5 flex flex-wrap gap-5 text-xs">
                <Link href="/decisions" className="text-primary hover:underline">see the decision it produced</Link>
                {orderId && <Link href={`/pay/${orderId}`} className="text-primary hover:underline">authorize the payment</Link>}
                {orderId && <Link href={`/receipts/${orderId}`} className="text-primary hover:underline">its receipt</Link>}
              </div>
              {misquotes.length === 0 && (
                <p className="mt-4 text-xs text-fg-3">
                  It stayed honest this run. That is a real result, not a failure — temperature is 0.7, so send it again for another sample.
                </p>
              )}
            </section>
          )}
        </div>
      </ScrollPanel>
    </>
  );
}
