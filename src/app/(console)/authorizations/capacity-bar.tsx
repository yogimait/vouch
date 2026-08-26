import { Card } from "@/components/ui/card";
import { formatInr } from "@/core/money";

interface Props { maxPaise: bigint; debitedPaise: bigint; heldPaise: bigint; availablePaise: bigint }

/** Percentages only — this is layout, not money maths. Every displayed amount stays bigint. */
function pct(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10000n) / whole) / 100;
}

export function CapacityBar({ maxPaise, debitedPaise, heldPaise, availablePaise }: Props) {
  const debited = pct(debitedPaise, maxPaise);
  const held = pct(heldPaise, maxPaise);

  return (
    <Card className="glass gap-0 p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="label">Authorized capacity</span>
        <span className="label">of {formatInr(maxPaise)}</span>
      </div>

      <div className="flex h-14 w-full overflow-hidden rounded border border-hairline">
        <div
          className="bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${debited}%` }}
          title={`Debited ${formatInr(debitedPaise)}`}
        />
        {/* Zero-width held would vanish, so it keeps a 2px tick to stay legible. */}
        <div
          className="bg-primary/35 transition-[width] duration-500 ease-out"
          style={{ width: held > 0 ? `${held}%` : "2px" }}
          title={`Held ${formatInr(heldPaise)}`}
        />
        {/* A faint fill so the bar still reads as a bar when nothing has been debited yet. */}
        <div className="flex-1 bg-white/[0.04]" title={`Available ${formatInr(availablePaise)}`} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {([
          ["debited", debitedPaise, "text-primary"],
          ["held", heldPaise, "text-primary/60"],
          ["available", availablePaise, "text-fg"],
        ] as const).map(([label, value, tone]) => (
          <div key={label}>
            <div className="label">{label}</div>
            <div className={`mt-1 font-mono text-base tabular-nums ${tone}`}>{formatInr(value)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
