import type { ReactNode } from "react";

/** Every panel states the question first. A control with no question is a toy. */
export function Panel({ n, title, asks, children }: { n: number; title: string; asks: string; children: ReactNode }) {
  return (
    <section className="mb-16 scroll-mt-8" id={`act-${n}`}>
      <div className="mb-5 flex items-baseline gap-4">
        <span className="font-display text-3xl text-fg-3">{String(n).padStart(2, "0")}</span>
        <div>
          <h2 className="font-display text-xl tracking-wide">{title}</h2>
          <p className="mt-0.5 text-sm text-fg-2">{asks}</p>
        </div>
      </div>
      <div className="glass rounded-lg p-6">{children}</div>
    </section>
  );
}

export function Button({ onClick, busy, children, tone = "accent" }: {
  onClick: () => void; busy?: boolean; children: ReactNode; tone?: "accent" | "quiet" | "danger";
}) {
  const skin = tone === "accent"
    ? "bg-accent text-black hover:bg-accent-bright"
    : tone === "danger"
      ? "border border-refuse/40 text-refuse hover:bg-refuse/10"
      : "border border-hairline text-fg-2 hover:text-fg";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${skin}`}
    >
      {busy ? "running…" : children}
    </button>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs leading-relaxed text-fg-3">{children}</p>;
}

/** One line of a run, with the tick or cross that says whether the guard was happy. */
export function Step({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <li className="flex gap-3 py-1.5">
      <span className={`mt-0.5 shrink-0 font-mono text-xs ${ok ? "text-admit" : "text-refuse"}`}>{ok ? "ok" : "no"}</span>
      <span className="shrink-0 font-mono text-xs text-fg-3">{name}</span>
      <span className="text-sm text-fg-2">{detail}</span>
    </li>
  );
}
