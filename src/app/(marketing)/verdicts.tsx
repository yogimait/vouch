import { gateFacts, landingProof, type GateFacts } from "@/core/db/queries";
import { RULES } from "@/core/engine/rules";
import { VerdictCards } from "./verdict-cards";
import { GateLab } from "./gate-lab";

/**
 * The same card vocabulary the console uses, on the front door, reading the same rows — so the two
 * surfaces cannot disagree. The rule count comes off the engine's own array, never typed in.
 */
export async function Verdicts() {
  const { verdicts } = await landingProof();
  // Sequential, not Promise.all: two pooled connections per request is how the console deadlocked.
  const facts = await gateFacts();

  return (
    <section className="border-t border-hairline px-6 py-24 sm:px-10">
      <div className="mx-auto max-w-[1200px]">
        {/* GateLab owns the columns so the ladder can fill the space beside the panel. Without
            facts (an unseeded database) the heading renders on its own. */}
        <Frame facts={facts}>
          <p className="kicker">{"// three verdicts, no fourth"}</p>
          {/* The page's largest section head, capped just under the hero h1 at 5.575rem: a section
              that outranks the headline reads as the top of the page. Still inside the measured
              56-96px band, so display-lg's own leading and tracking stay correct. */}
          <h2 className="display-lg mt-6 max-w-[15ch] text-[clamp(3.25rem,6vw,5.4rem)]">
            {RULES.length} ordered rules. No model reaches <span className="em">a verdict</span>.
          </h2>
          <p className="mt-7 max-w-[48ch] text-[17px] leading-relaxed text-fg-2">
            First match wins, so every decision names exactly one rule. A language model can read a
            catalogue and write a sentence; it cannot reach a price, a signature check, or this answer.
          </p>
        </Frame>

        <div className="mt-12">
          <VerdictCards verdicts={verdicts} />
        </div>
      </div>
    </section>
  );
}

function Frame({ facts, children }: { facts: GateFacts | null; children: React.ReactNode }) {
  if (!facts || facts.items.length === 0) return <>{children}</>;
  return <GateLab facts={facts}>{children}</GateLab>;
}
