import { landingProof } from "@/core/db/queries";
import { RULES } from "@/core/engine/rules";
import { VerdictCards } from "./verdict-cards";

/**
 * The same card vocabulary the console uses, on the front door, reading the same rows — so the two
 * surfaces cannot disagree. The rule count comes off the engine's own array, never typed in.
 */
export async function Verdicts() {
  const { verdicts } = await landingProof();

  return (
    <section className="border-t border-hairline px-6 py-24 sm:px-10">
      <div className="mx-auto max-w-[1200px]">
        <p className="kicker">{"// three verdicts, no fourth"}</p>
        <h2 className="display-lg mt-5 max-w-[18ch]">
          {RULES.length} ordered rules. No model reaches <span className="em">a verdict</span>.
        </h2>
        <p className="mt-6 max-w-[62ch] text-[15px] leading-relaxed text-fg-2">
          First match wins, so every decision names exactly one rule. A language model can read a
          catalogue and write a sentence; it cannot reach a price, a signature check, or this answer.
        </p>

        <div className="mt-10">
          <VerdictCards verdicts={verdicts} />
        </div>
      </div>
    </section>
  );
}
