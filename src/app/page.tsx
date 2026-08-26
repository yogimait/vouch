import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Disc } from "./(marketing)/disc";
import { Stats, StatsSkeleton } from "./(marketing)/stats";
import { Verdicts } from "./(marketing)/verdicts";
import { Proof } from "./(marketing)/proof";
import { Close } from "./(marketing)/close";

// The shell has no awaits, so it streams at once and only the read blocks wait on Postgres.
export const dynamic = "force-dynamic";

export default function Landing() {
  return (
    <main className="bg-background">
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-display text-lg tracking-[-0.02em] text-fg-white">Vouch</span>
        <Button asChild size="sm"><Link href="/agent">Open the console</Link></Button>
      </header>

      {/* Left-aligned, not centred: DESIGN_INTEL §6 item 7 is explicit, and the shipped page broke it. */}
      <section className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden px-6 pt-28 pb-[42vh] sm:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <p className="kicker">{"// merchant-side admission"}</p>
          <h1 className="display-xl mt-6 max-w-[15ch]">
            Proof that the agent was <span className="em">allowed</span> to spend
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

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[52vh]">
          <Disc />
        </div>
      </section>

      {/* Each streams behind the fold: nothing above it waits on a database round trip. */}
      <Suspense fallback={<StatsSkeleton />}><Stats /></Suspense>
      <Suspense fallback={<div className="h-[28rem] border-t border-hairline" />}><Verdicts /></Suspense>
      <Suspense fallback={<div className="h-[30rem] border-t border-hairline" />}><Proof /></Suspense>
      <Close />
    </main>
  );
}
