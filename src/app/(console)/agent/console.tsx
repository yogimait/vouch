"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { DecisionSummary, Mandate, Misquote } from "@/demo/agent";
import type { Preset } from "@/demo/instructions";
import { Step, type StepEvent } from "./transcript";
import { MandateStrip } from "./mandate";
import { Decisions } from "./decisions";

interface Run { model: string; temperature: number; agent: string }

export function AgentConsole({ presets, mandate: seeded }: { presets: Preset[]; mandate: Mandate | null }) {
  const [instruction, setInstruction] = useState(presets[0].instruction);
  const [who, setWho] = useState<"shopbot" | "frozen">("shopbot");
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(seeded);
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [misquotes, setMisquotes] = useState<Misquote[]>([]);
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
    setSteps([]); setMisquotes([]); setDecisions([]); setVerdict(null); setOrderId(null); setRun(null); setRunning(true);

    const es = new EventSource(`/api/demo/agent?agent=${who}&instruction=${encodeURIComponent(instruction)}`);
    source.current = es;
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "start") { setRun({ model: data.model, temperature: data.temperature, agent: data.agent }); setMandate(data.mandate); }
      if (data.type === "step") setSteps((prior) => [...prior, data]);
      if (data.type === "done") {
        setMisquotes(data.misquotes ?? []);
        setDecisions(data.decisions ?? []);
        setMandate(data.mandate);
        setOrderId(data.orderId ?? null);
        setVerdict(data.text || "finished without a closing statement");
        stop();
      }
      if (data.type === "error") { setVerdict(`failed: ${data.message}`); stop(); }
    };
    // Without this a dropped connection reconnects on its own and silently starts a second run.
    es.onerror = () => stop();
  }

  return (
    <>
      <div className="mb-8">
        <MandateStrip mandate={mandate} agent={run?.agent ?? (who === "frozen" ? "FrozenBot" : "ShopBot")} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="label mr-2">acting as</span>
        {(["shopbot", "frozen"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setWho(id)}
            className={`rounded border px-3 py-1.5 text-xs transition-colors ${
              who === id ? "border-accent/50 text-accent" : "border-hairline text-fg-3 hover:text-fg"
            }`}
          >
            {id === "shopbot" ? "ShopBot — active" : "FrozenBot — frozen"}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setInstruction(p.instruction)}
            title={p.expect}
            className={`rounded border px-3 py-1.5 text-xs transition-colors ${
              instruction === p.instruction
                ? "border-accent/50 text-accent"
                : "border-hairline text-fg-3 hover:text-fg"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Tell the agent what to buy."
        className="w-full rounded border border-hairline bg-raised p-4 text-sm leading-relaxed"
      />

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={running ? stop : start}
          disabled={!instruction.trim()}
          className={`rounded-full px-5 py-2 text-sm font-medium disabled:opacity-40 ${
            running ? "border border-hairline text-fg-2" : "bg-accent text-black hover:bg-accent-bright"
          }`}
        >
          {running ? "Stop" : "Send it"}
        </button>
        {run && (
          <span className="font-mono text-xs text-fg-3">
            {run.model} · temperature {run.temperature}
          </span>
        )}
        {running && <span className="text-xs text-fg-3">working…</span>}
      </div>

      {steps.length > 0 && <ol className="mt-8">{steps.map((s) => <Step key={s.index} step={s} />)}</ol>}

      {decisions.length > 0 && <Decisions rows={decisions} />}

      {misquotes.length > 0 && (
        <div className="mt-8 rounded border border-refuse/40 p-5">
          <div className="label mb-3 text-refuse">it tried to state a price the merchant never signed · {misquotes.length}</div>
          {misquotes.map((m, i) => (
            <div key={i} className="border-t border-hairline py-3 first:border-t-0 first:pt-0">
              <span className="font-mono text-xs">{m.kind}</span>
              {m.code && <span className="ml-3 text-sm">invented <span className="font-mono text-refuse">{m.code}</span></span>}
              {m.claimed && <span className="ml-3 text-sm">claimed {m.claimed} against a signed {m.signed}</span>}
            </div>
          ))}
        </div>
      )}

      {verdict && (
        <div className="mt-8 border-t border-hairline pt-6">
          <div className="label mb-2">what it reported back</div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-2">{verdict}</p>
          <div className="mt-5 flex flex-wrap gap-5 text-xs">
            <Link href="/decisions" className="text-accent hover:underline">see the decision it produced</Link>
            {orderId && <Link href={`/pay/${orderId}`} className="text-accent hover:underline">authorize the payment</Link>}
            {orderId && <Link href={`/receipts/${orderId}`} className="text-accent hover:underline">its receipt</Link>}
          </div>
          {misquotes.length === 0 && (
            <p className="mt-4 text-xs text-fg-3">
              It stayed honest this run. That is a real result, not a failure — temperature is 0.7, so send it again for another sample.
            </p>
          )}
        </div>
      )}
    </>
  );
}
