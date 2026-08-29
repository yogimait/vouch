"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentOverview } from "@/core/db/overview/agent";
import type { Preset } from "@/demo/instructions";
import { TextType } from "@/components/ui/text-type";
import { PageScroll, ScrollPanel } from "../ui";
import { AgentCards, type RunResult } from "./cards";
import { ChipGroup } from "./chips";
import { RunLog, type PastRun } from "./log";
import { Result } from "./result";

const WHO = [
  { id: "shopbot", label: "ShopBot" },
  { id: "frozen", label: "FrozenBot" },
];

const NOTHING: RunResult = { mandate: null, decisions: [], misquotes: [] };

/** A transcript is ~12kB. Ten is a session's worth and nowhere near the storage ceiling. */
const KEEP = 10;

/**
 * The runs survive leaving the page. sessionStorage, not localStorage: a run belongs to the tab it
 * happened in, and last week's transcript above today's mandate would be a lie.
 */
const KEY = "vouch.agent.transcript";

interface Saved { instruction: string; who: string; past: PastRun[] }

/** Never fires: the only question is server render versus client render, and that changes once. */
const NEVER = () => () => {};

function useSaved(): Saved | null {
  const raw = useSyncExternalStore(NEVER, () => sessionStorage.getItem(KEY), () => null);
  return useMemo(() => (raw ? JSON.parse(raw) as Saved : null), [raw]);
}

interface Props { presets: Preset[]; overviews: Record<string, AgentOverview> }

export function AgentConsole(props: Props) {
  const saved = useSaved();
  // Remounted once, at hydration. Lazy initializers are the only place restored state can land
  // without either a hydration mismatch or a setState inside an effect.
  return <Console {...props} saved={saved} key={saved ? "restored" : "fresh"} />;
}

function Console({ presets, overviews, saved }: Props & { saved: Saved | null }) {
  const [instruction, setInstruction] = useState(saved?.instruction ?? presets[0].instruction);
  const [who, setWho] = useState(saved?.who ?? "shopbot");
  // Newest first, so index 0 is the run that just finished and the log reads top-down.
  const [past, setPast] = useState<PastRun[]>(saved?.past ?? []);
  const [selected, setSelected] = useState<number | null>(saved?.past?.length ? 0 : null);
  // The run streaming right now. It outranks the selection, so a run always shows itself.
  const [live, setLive] = useState<PastRun | null>(null);
  // Counted, not derived from lengths: KEEP caps `past`, so a full log would report no new runs.
  const [freshCount, setFreshCount] = useState(0);
  const [running, setRunning] = useState(false);
  const source = useRef<EventSource | null>(null);
  const building = useRef<PastRun | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Written only between runs, and only once there is something to write. Both halves matter: on a
  // reload this mounts empty first and would otherwise erase the saved runs before React re-reads
  // the store and remounts with them.
  useEffect(() => {
    if (running || past.length === 0) return;
    sessionStorage.setItem(KEY, JSON.stringify({ instruction, who, past }));
  }, [running, instruction, who, past]);

  function stop() {
    source.current?.close();
    source.current = null;
    setRunning(false);
  }

  /** State and ref together: the ref is what the "done" handler reads, free of a stale closure. */
  function build(next: PastRun) {
    building.current = next;
    setLive(next);
  }

  function select(i: number) {
    building.current = null;
    setLive(null);
    setSelected(i);
  }

  function start() {
    stop();
    building.current = null;
    setLive(null); setSelected(null); setRunning(true);

    // The cards above are the setup and worth seeing before the errand is sent; the transcript is
    // what happens next. Pressing the button is the moment the page should move between them.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });

    // Captured now, so a chip clicked mid-run cannot file this run's rows under the other agent.
    const acting = who;
    const asked = instruction;
    const blank: PastRun = {
      at: Date.now(), agent: acting, instruction: asked,
      model: "", temperature: 0, steps: [], verdict: "", orderId: null, result: NOTHING,
    };

    const es = new EventSource(`/api/demo/agent?agent=${acting}&instruction=${encodeURIComponent(asked)}`);
    source.current = es;
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const now = building.current ?? blank;

      if (data.type === "start") build({ ...now, model: data.model, temperature: data.temperature });
      if (data.type === "step") build({ ...now, steps: [...now.steps, data] });
      if (data.type === "done") {
        const done: PastRun = {
          ...now,
          verdict: data.text || "finished without a closing statement",
          orderId: data.orderId ?? null,
          result: { mandate: data.mandate ?? null, decisions: data.decisions ?? [], misquotes: data.misquotes ?? [] },
        };
        setPast((prior) => [done, ...prior].slice(0, KEEP));
        setFreshCount((n) => n + 1);
        setSelected(0);
        building.current = null;
        setLive(null);
        stop();
      }
      // Kept live rather than logged: a stream that never answered is not a run the guard ruled on.
      if (data.type === "error") { build({ ...now, verdict: `failed: ${data.message}` }); stop(); }
    };
    // Without this a dropped connection reconnects on its own and silently starts a second run.
    es.onerror = () => stop();
  }

  const view = live ?? (selected === null ? null : past[selected] ?? null);
  // Only runs made since this mount. The rest are already counted in the overview the server sent.
  const fresh = past.slice(0, Math.min(freshCount, past.length))
    .filter((r) => r.agent === who)
    .map((r) => r.result);

  return (
    <PageScroll>
      <AgentCards overview={overviews[who]} runs={fresh} />

      {/* Composer left, result right. Stacked, the result took what the cards and the composer left
          it — 44px of body at 760px, for the one thing this page is about. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div>
            <ChipGroup label="acting as" chips={WHO} selected={who} onSelect={setWho} />
            <ChipGroup
              label="try"
              chips={presets.map((p) => ({ id: p.instruction, label: p.label, hint: p.expect }))}
              selected={instruction}
              onSelect={setInstruction}
            />

            {/* The button sits in the composer rather than under it: as its own row it pushed the
                page's primary action 31px below the fold on a 760px screen. */}
            <div className="relative">
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Tell the agent what to buy."
                className="bg-raised p-4 pb-14 text-sm leading-relaxed"
              />
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-end gap-3">
                {running && <span className="mr-auto text-xs text-fg-3">working…</span>}
                <Button
                  type="button"
                  onClick={running ? stop : start}
                  disabled={!instruction.trim()}
                  variant={running ? "outline" : "default"}
                  className="rounded-[2px]"
                >
                  {running ? "Stop" : "Send it"}
                </Button>
              </div>
            </div>
            {view?.model && (
              <p className="mt-3 font-mono text-xs text-fg-3">{view.model} · temperature {view.temperature}</p>
            )}
          </div>

          <RunLog runs={past} selected={live ? null : selected} onSelect={select} />
        </div>

        <div ref={panel} className="flex scroll-mt-2 flex-col">
          <ScrollPanel
            title="its reasoning, its tool calls, and the merchant's answers"
            count={view?.steps.length ?? 0}
            bodyClassName="px-4 py-4"
            className="mt-0 lg:min-h-[34rem]"
          >
            {view ? (
              <Result run={view} />
            ) : (
              <div className="rounded-[3px] border border-dashed border-hairline px-6 py-6 text-center">
                <p className="text-sm text-fg-2">Nothing has run yet. Pick an errand on the left, or write your own.</p>
                {/* The real preset instructions, typed — every one of them is a chip you can press. */}
                <TextType
                  as="p"
                  text={presets.map((p) => p.instruction)}
                  className="mx-auto mt-3 max-w-[64ch] font-mono text-xs text-primary"
                  typingSpeed={26}
                  deletingSpeed={12}
                  pauseDuration={2600}
                  variableSpeed={{ min: 18, max: 46 }}
                  startOnVisible
                />
              </div>
            )}
          </ScrollPanel>
        </div>
      </div>
    </PageScroll>
  );
}
