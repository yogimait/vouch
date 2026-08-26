import Link from "next/link";
import { Disc } from "./(marketing)/disc";
import { Stats } from "./(marketing)/stats";


const CLAIMS = [
  ["Every price is signed", "The agent cannot state an amount. There is no field for it."],
  ["Every decision is deterministic", "Thirteen ordered rules. No model reaches a verdict, a price, or a signature."],
  ["Every order leaves a receipt", "Who delegated the authority, when, with what scope, and whether the agent stayed inside it."],
];

export const dynamic = "force-dynamic";

export default function Landing() {
  return (
    <main className="bg-black">
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-8 py-5">
        <span className="font-display text-lg tracking-wide">Vouch</span>
        <Link href="/decisions" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-bright">
          Open the console
        </Link>
      </header>

      <section className="relative isolate flex min-h-dvh flex-col items-center overflow-hidden pt-32">
        <p className="font-display text-sm uppercase tracking-[0.35em] text-fg-2">Vouch</p>
        <h1 className="mt-6 max-w-[16ch] text-center font-serif text-5xl leading-[1.08] text-white md:text-7xl">
          Proof that the agent was allowed to spend
        </h1>
        <p className="mt-7 max-w-[42rem] text-center text-lg text-fg-2">
          The merchant-side layer that lets AI buyers pay, and proves afterwards that they were
          inside their authority.
        </p>
        <Link href="/decisions" className="mt-9 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-black hover:bg-accent-bright">
          Read the architecture
        </Link>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62vh]">
          <Disc />
        </div>
      </section>

      <Stats />

      {CLAIMS.map(([heading, body]) => (
        <section key={heading} className="border-b border-hairline px-8 py-28 text-center">
          <h2 className="font-serif text-3xl text-white md:text-4xl">{heading}</h2>
          <p className="mx-auto mt-4 max-w-[46rem] text-lg text-fg-2">{body}</p>
        </section>
      ))}

      <footer className="flex items-center justify-between px-8 py-8">
        <span className="font-display text-base">Vouch</span>
        <span className="font-mono text-xs text-fg-3">Razorpay AI Buildathon — Track 01</span>
      </footer>
    </main>
  );
}
