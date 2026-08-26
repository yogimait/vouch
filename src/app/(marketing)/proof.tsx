import Link from "next/link";
import { landingProof } from "@/core/db/queries";
import { formatInr } from "@/core/money";
import { Transcript, type TranscriptLine } from "./transcript";
import { Hash } from "./hash";

/**
 * Everything on this section is a row from the database. The transcript is not a replay of a
 * scripted run — it is the most recent refusal, formatted. A plausible-looking transcript is exactly
 * the failure this product exists to catch.
 */
export async function Proof() {
  const { refusal, receipt } = await landingProof();

  return (
    <section className="border-t border-hairline px-6 py-24 sm:px-10">
      <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="kicker">{"// the agent cannot state a price"}</p>
          <h2 className="display-lg mt-5 max-w-[14ch]">
            It asked. The gate <span className="em">answered</span>.
          </h2>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-fg-2">
            There is no amount parameter on the pay call. The agent sends a token the merchant signed,
            and the engine re-derives the price from the catalogue before anything is charged.
          </p>

          <div className="mt-8">
            {refusal ? (
              <Transcript
                footer={`Decided in ${refusal.latencyMs === 0 ? "under a millisecond" : `${refusal.latencyMs}ms`}, before any payment payload existed.`}
                lines={refusalLines(refusal)}
              />
            ) : (
              <Transcript
                footer="Run npm run demo:2 and this fills from the database."
                lines={[{ kind: "note", text: "No decision has been recorded yet." }]}
              />
            )}
          </div>
        </div>

        <div className="lg:pt-16">
          <p className="kicker">{"// and it left a receipt"}</p>
          <h2 className="display-lg mt-5 max-w-[13ch]">
            Signed, hashed, <span className="em">re-checkable</span>.
          </h2>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-fg-2">
            Six blocks, each hashed on its own, so a failed check names which one moved. Anyone
            holding the file can verify it with no database, no keys and no network.
          </p>

          <div className="mt-8">
            {receipt ? (
              <div className="rounded-[3px] border border-hairline bg-card">
                <div className="flex items-baseline justify-between gap-4 border-b border-hairline px-4 py-3">
                  <span className="kicker">receipt</span>
                  <span className="font-mono text-[11px] text-fg-3">{receipt.keyId}</span>
                </div>
                <div className="p-4">
                  <div className="font-display text-[2.5rem] leading-none tracking-[-0.05em] text-fg-white">
                    {formatInr(receipt.amountPaise)}
                  </div>
                  <div className="label mt-2">{receipt.merchantName}</div>

                  <div className="mt-6">
                    <div className="label">body hash</div>
                    <Hash value={receipt.bodyHash} />
                  </div>

                  <Link
                    href={`/receipts/${receipt.orderId}`}
                    className="feedback mt-6 inline-block text-xs text-primary hover:text-admit"
                  >
                    verify this one &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-[3px] border border-dashed border-hairline px-6 py-14 text-center">
                <p className="text-sm text-fg-2">No receipt has been issued yet.</p>
                <p className="mt-2 font-mono text-xs text-fg-3">A receipt is signed the moment an order settles.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The refusal, told as the exchange that produced it. Every value comes off the decision row. */
function refusalLines(r: NonNullable<Awaited<ReturnType<typeof landingProof>>["refusal"]>): TranscriptLine[] {
  const item = r.sku ? `${r.sku} × ${r.qty ?? 1}` : "an item";
  const signed = r.totalPaise === null ? null : formatInr(r.totalPaise);

  return [
    { kind: "req", text: `POST /api/quote`, detail: `${r.agentName} asks the merchant to sign a price for ${item}` },
    ...(signed ? [{ kind: "res" as const, text: `200 — offer signed at ${signed}` }] : []),
    { kind: "req", text: "POST /api/pay", detail: "the token, an idempotency key, and no amount field" },
    { kind: "refuse", text: r.code },
    ...(r.message ? [{ kind: "note" as const, text: r.message }] : []),
    ...(r.observed
      ? [{ kind: "note" as const, text: `observed ${money(r.observed)} · expected ${money(r.expected)}` }]
      : []),
  ];
}

/** Reason values carry paise as digit strings; anything else is a count or a status word. */
function money(value: string | null): string {
  if (value === null) return "—";
  return /^\d+$/.test(value) ? formatInr(BigInt(value)) : value;
}
