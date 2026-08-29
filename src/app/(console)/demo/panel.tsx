import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Four panels share one habit: the label becomes "running…" while the request is in flight. */
export function RunButton({ onClick, busy, children, tone = "accent" }: {
  onClick: () => void; busy?: boolean; children: ReactNode; tone?: "accent" | "quiet" | "danger";
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={busy}
      variant={tone === "accent" ? "default" : "outline"}
      className={cn("rounded-[2px]", tone === "danger" && "border-refuse/40 text-refuse hover:bg-refuse/10 hover:text-refuse")}
    >
      {busy ? "running…" : children}
    </Button>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs leading-relaxed text-fg-3">{children}</p>;
}

/** One line of a run, with the tick or cross that says whether the guard was happy. */
export function Step({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <li className="flex gap-3 py-1.5">
      <span className={cn("mt-0.5 shrink-0 font-mono text-xs", ok ? "text-admit" : "text-refuse")}>{ok ? "ok" : "no"}</span>
      <span className="shrink-0 font-mono text-xs text-fg-3">{name}</span>
      <span className="text-sm text-fg-2">{detail}</span>
    </li>
  );
}
