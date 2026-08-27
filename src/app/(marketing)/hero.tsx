import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { latestVerdicts } from "@/core/db/queries";
import Ferrofluid from "@/components/ui/ferrofluid";
import { TextType } from "@/components/ui/text-type";
import { VerdictPixels } from "./verdict-pixels";

/**
 * Module scope on purpose: Ferrofluid lists `colors` in its effect deps, so an inline array would
 * be a new reference every render and tear the WebGL context down and back up each time.
 */
const FLUID = ["#04201d", "#0a3d38", "#12655c"];

/** The three verdicts, as the sentence they finish. Grammatical after "the agent was", all three. */
const VERDICTS = ["allowed to spend", "refused, and told why", "beyond its authority"];

const LONGEST = VERDICTS.reduce((a, b) => (b.length > a.length ? b : a));

/** Its own read, behind its own boundary: the headline must never wait on Postgres to paint. */
async function Verdicts() {
  const rows = await latestVerdicts();
  return <VerdictPixels rows={rows} />;
}

export function Hero() {
  return (
    // Left-aligned, not centred: DESIGN_INTEL §6 item 7 is explicit, and the shipped page broke it.
    <section className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden px-6 pt-28 pb-28 sm:px-10">
      {/* dpr={1}: at the device ratio this fragment shader was ~200M sin() a frame on a retina
          laptop, for a blurred background at 40% opacity behind a scrim. Nothing survives a second
          sample. Visibility gating and reduced motion live inside the component. */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-40">
        <Ferrofluid dpr={1} colors={FLUID} speed={0.15} scale={1.7} glow={1.7} shimmer={0.35} rimWidth={0.26} opacity={0.8} mouseInteraction={false} />
      </div>
      {/* The fluid runs to the top edge; the copy needs an unlit floor to sit on. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-background via-background/55 to-transparent" />

      <div className="mx-auto w-full max-w-[1200px]">
        <p className="kicker">{"// merchant-side admission"}</p>
        {/* The animated tail is decorative; assistive tech gets the canonical sentence instead. */}
        <h1 className="display-xl mt-6 grid max-w-[13ch]" aria-label="Proof that the agent was allowed to spend">
          {/* The longest verdict, invisible, in the same grid cell: it reserves the exact height the
              typed line will need at this width, so nothing below it moves and no line is wasted. */}
          <span className="invisible [grid-area:1/1]" aria-hidden>Proof that the agent was {LONGEST}</span>
          <span className="[grid-area:1/1]">
            Proof that the agent was{" "}
            <TextType
              className="em"
              text={VERDICTS}
              typingSpeed={55}
              deletingSpeed={26}
              initialDelay={500}
              pauseDuration={2800}
              cursorClassName="text-primary"
            />
          </span>
        </h1>
        <p className="mt-8 max-w-[52ch] text-lg leading-relaxed text-fg-2">
          An AI buyer is about to move your money. Something has to answer before it does — and
          afterwards, something has to prove what the answer was.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link href="/agent">Watch an agent try</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/decisions">Read the decisions</Link></Button>
        </div>
      </div>

      {/* Three real rows, one per verdict. Desktop only: on a phone it would sit on the headline. */}
      <div className="absolute top-1/2 right-[6%] hidden -translate-y-1/2 lg:block xl:right-[9%]">
        <Suspense fallback={null}><Verdicts /></Suspense>
      </div>
    </section>
  );
}
