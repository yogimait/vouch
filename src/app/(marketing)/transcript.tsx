"use client";

import { BlurFade } from "@/components/ui/blur-fade";
import DecryptedText from "@/components/ui/decrypted-text";
import { cn } from "@/lib/utils";

export interface TranscriptLine {
  kind: "req" | "res" | "note" | "refuse";
  text: string;
  detail?: string;
}

/**
 * Not a typewriter. Typing out a transcript that is already known is theatre, and a typing speed
 * would be a fourth motion duration on a page with three. The lines arrive on the measured 700ms
 * reveal instead, and the only thing that decodes is the refusal code.
 */
export function Transcript({ lines, footer }: { lines: TranscriptLine[]; footer?: string }) {
  return (
    <div className="rounded-[3px] border border-hairline bg-card">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <span className="size-1.5 rounded-full bg-admit" />
        <span className="kicker">from the record</span>
      </div>

      <div className="flex flex-col gap-2 p-4 font-mono text-[12px] leading-relaxed">
        {lines.map((line, i) => (
          <BlurFade key={i} delay={0.15 + i * 0.09} duration={0.7} offset={6} inView>
            <div className="flex gap-3">
              <span className={cn("w-4 shrink-0 select-none", GUTTER[line.kind])}>{MARK[line.kind]}</span>
              <span className="min-w-0">
                {line.kind === "refuse" ? (
                  <DecryptedText
                    text={line.text}
                    animateOn="view"
                    sequential
                    speed={26}
                    className="text-refuse"
                    encryptedClassName="text-fg-3"
                  />
                ) : (
                  <span className={BODY[line.kind]}>{line.text}</span>
                )}
                {line.detail && <div className="mt-0.5 text-[11px] text-fg-3">{line.detail}</div>}
              </span>
            </div>
          </BlurFade>
        ))}
      </div>

      {footer && (
        <div className="border-t border-hairline px-4 py-2.5 text-[11px] text-fg-3">{footer}</div>
      )}
    </div>
  );
}

const MARK = { req: "›", res: "‹", note: " ", refuse: "✕" } as const;
const GUTTER = { req: "text-fg-3", res: "text-fg-3", note: "text-fg-3", refuse: "text-refuse" } as const;
const BODY = { req: "text-fg", res: "text-fg-2", note: "text-fg-3", refuse: "text-refuse" } as const;
