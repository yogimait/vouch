import type { ReactNode } from "react";
import { formatInr } from "@/core/money";

const OUTCOME = {
  ADMIT: "text-admit",
  ESCALATE: "text-escalate",
  REFUSE: "text-refuse",
} as const;

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-2xl tracking-wide">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
    </header>
  );
}

export function StatTile({ label, value, accent }: { label: string; value: string; accent?: keyof typeof OUTCOME }) {
  return (
    <div className="glass rounded-lg px-6 py-5" style={accent ? { borderTopWidth: 2, borderTopColor: `var(--color-${accent.toLowerCase()})` } : undefined}>
      <div className="label">{label}</div>
      <div className="mt-2 font-display text-3xl">{value}</div>
    </div>
  );
}

export function Outcome({ value }: { value: keyof typeof OUTCOME }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium tracking-wide ${OUTCOME[value]}`}>
      <span className="size-2 rounded-full bg-current" />
      {value}
    </span>
  );
}

/** Ids are long and never the point. Truncate in the middle so both ends stay readable. */
export function Id({ value, head = 8, tail = 6 }: { value: string; head?: number; tail?: number }) {
  const short = value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
  return <span className="font-mono text-xs text-fg-3" title={value}>{short}</span>;
}

export function Money({ paise }: { paise: bigint }) {
  return <span className="font-mono tabular-nums">{formatInr(paise)}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2">
      <span className="label shrink-0">{label}</span>
      <span className="text-right font-mono text-sm break-all">{children}</span>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline px-8 py-16 text-center">
      <p className="text-sm text-fg-2">{title}</p>
      <p className="mt-2 font-mono text-xs text-fg-3">{hint}</p>
    </div>
  );
}

/** Reason values carry paise as strings. A count (catalog.inventory) is left alone. */
export function asMoney(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return String(value ?? "—");
  return formatInr(BigInt(value));
}

interface VerdictProps {
  valid: boolean;
  signatureValid: boolean;
  tampered: string[];
  chain?: { valid: boolean; rowsChecked: number; brokenAt: string | null };
}

/** States the verdict and what produced it, because "valid" alone is not evidence of anything. */
export function Verdict({ valid, signatureValid, tampered, chain }: VerdictProps) {
  return (
    <section className={`glass rounded-lg border p-6 ${valid ? "border-admit/30" : "border-refuse/40"}`}>
      <div className={`font-display text-2xl ${valid ? "text-admit" : "text-refuse"}`}>
        {valid ? "Verified" : "Does not verify"}
      </div>
      <div className="mt-4 grid gap-x-12 gap-y-1 sm:grid-cols-3">
        <Field label="signature">{signatureValid ? "valid" : "FAILED"}</Field>
        <Field label="blocks">{tampered.length ? `ALTERED: ${tampered.join(", ")}` : "all six intact"}</Field>
        <Field label="audit chain">
          {chain ? (chain.valid ? `intact across ${chain.rowsChecked} rows in range` : `BROKEN at ${chain.brokenAt}`) : "not anchored"}
        </Field>
      </div>
    </section>
  );
}
