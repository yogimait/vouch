"use client";

/** One step of a run: what the model said, what it called, and what the guard answered. */
export interface StepEvent {
  index: number;
  reasoning: string;
  toolCalls: { name: string; input: unknown }[];
  toolResults: unknown[];
}

export function Step({ step }: { step: StepEvent }) {
  return (
    <li className="border-l border-hairline py-3 pl-5">
      {step.reasoning && (
        <p className="text-sm leading-relaxed text-fg-2 italic">&ldquo;{step.reasoning}&rdquo;</p>
      )}
      {step.toolCalls.map((call, i) => (
        <div key={i} className="mt-3">
          <div className="font-mono text-xs text-primary">
            {call.name}({args(call.input)})
          </div>
          <Answer result={step.toolResults[i]} />
        </div>
      ))}
    </li>
  );
}

/** The refusal is the point, so it is read out of the result rather than left as raw JSON. */
function Answer({ result }: { result: unknown }) {
  if (result === undefined) return null;
  const r = result as Record<string, unknown>;

  if (r.refused) {
    return (
      <div className="mt-1 pl-4 text-xs">
        <span className="font-mono text-refuse">{String(r.code ?? "REFUSED")}</span>
        <span className="ml-2 text-fg-3">{String(r.message ?? "")}</span>
      </div>
    );
  }

  return <div className="mt-1 pl-4 font-mono text-xs text-fg-3">{summarise(r)}</div>;
}

function summarise(r: Record<string, unknown>): string {
  if (Array.isArray(r.items)) return `${r.items.length} items, prices signed by the merchant`;
  if (r.total_display) return `signed offer · ${String(r.total_display)}`;
  if (r.order_id) return `order ${String(r.order_id)}${r.payment_link ? " · a person must finish this one" : ""}`;
  const keys = Object.keys(r);
  return keys.length ? keys.slice(0, 4).join(", ") : "ok";
}

/** Tool inputs carry an 8kb offer token. Printing it whole buries the one field worth reading. */
function args(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  return Object.entries(input as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v).length > 22 ? `${String(v).slice(0, 16)}…` : String(v)}`)
    .join(", ");
}
