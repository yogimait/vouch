import Link from "next/link";
import { Button } from "@/components/ui/button";

const REFUSED = [
  ["No LLM in the money path", "A model can read the catalogue and write a sentence. It cannot reach a price, a signature check, or a verdict — and an ESLint rule fails the build if the agent module so much as imports the guard."],
  ["No risk score", "A hand-weighted number between nought and a hundred is the black box this exists to argue against. A refusal names the rule, the observed value and the expected one."],
  ["No second rail", "One merchant, one gateway, test mode. A payment that completes here completes the way a real one does, and it is never called simulated."],
];

/** What we chose not to build is the section a judge remembers, so it gets the same weight as a feature. */
export function Close() {
  return (
    <>
      <section className="border-t border-hairline px-6 py-24 sm:px-10">
        <div className="mx-auto max-w-[1200px]">
          <p className="kicker">{"// where we chose not to"}</p>
          <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-3">
            {REFUSED.map(([heading, body]) => (
              <div key={heading}>
                <h3 className="display-md text-[1.5rem]">{heading}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-fg-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline px-6 py-24 sm:px-10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-end justify-between gap-8">
          <h2 className="display-lg max-w-[16ch]">
            Give it a goal it <span className="em">cannot reach honestly</span>.
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/agent">Watch an agent try</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/receipts">See a receipt</Link></Button>
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline px-6 py-8 sm:px-10">
        <span className="font-display text-base tracking-[-0.02em]">Vouch</span>
        <span className="font-mono text-xs text-fg-3">Razorpay AI Buildathon — Track 01</span>
      </footer>
    </>
  );
}
