import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Hero } from "./(marketing)/hero";
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

      <Hero />

      {/* Each streams behind the fold: nothing above it waits on a database round trip. */}
      <Suspense fallback={<StatsSkeleton />}><Stats /></Suspense>
      <Suspense fallback={<div className="h-[28rem] border-t border-hairline" />}><Verdicts /></Suspense>
      <Suspense fallback={<div className="h-[30rem] border-t border-hairline" />}><Proof /></Suspense>
      <Close />
    </main>
  );
}
