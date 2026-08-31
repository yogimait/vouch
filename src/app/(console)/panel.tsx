import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared by every panel that fires a request: the label becomes "running…" while it is in flight. */
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
