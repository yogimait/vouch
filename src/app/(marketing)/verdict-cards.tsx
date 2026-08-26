"use client";

import { Big, BarRow, Note, StatCard } from "../(console)/cards";
import type { Tone } from "../(console)/format";

const COPY: [Tone, string, string, string][] = [
  ["ADMIT", "Admit", "inside its authority", "The agent stayed under every ceiling one human set for it. The order is created and a device authorises it."],
  ["ESCALATE", "Escalate", "legitimate, but beyond this agent", "Nothing is wrong with the purchase. It is simply larger than what was delegated, so a person finishes it."],
  ["REFUSE", "Refuse", "with a code it can act on", "A machine-readable reason, the observed value and the expected one. No order is created and the attempt is still recorded."],
];

/** Three cards, three shares of one total — a real shared denominator, so the bars mean something. */
export function VerdictCards({ verdicts }: { verdicts: { admit: number; escalate: number; refuse: number } }) {
  const total = verdicts.admit + verdicts.escalate + verdicts.refuse;
  const counts = { ADMIT: verdicts.admit, ESCALATE: verdicts.escalate, REFUSE: verdicts.refuse };

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {COPY.map(([tone, title, caption, body], i) => (
        <StatCard key={tone} title={title} index={i}>
          <Big value={counts[tone]} caption={caption} tone={tone} />
          <p className="mt-4 text-[13px] leading-relaxed text-fg-2">{body}</p>
          <div className="mt-auto pt-5">
            <BarRow name={tone} value={counts[tone]} of={total} tone={tone} />
            <Note>share of every decision on the record</Note>
          </div>
        </StatCard>
      ))}
    </div>
  );
}
