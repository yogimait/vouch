"use client";

/**
 * Without this, a throw on the server renders Next's bare "Application error" — no nav, no way back.
 * The likeliest cause is environment, not code: getDb() throws with no DATABASE_URL and demoAgent()
 * throws on an unseeded database, which is the state a fresh clone starts in.
 */

import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 sm:px-10">
      <div className="mx-auto w-full max-w-[52ch]">
        <p className="kicker">{"// this page did not render"}</p>
        <h1 className="display-md mt-5">Something threw before the page could answer.</h1>
        <p className="mt-5 text-sm leading-relaxed text-fg-2">
          The most likely cause is an environment one: no <span className="font-mono">DATABASE_URL</span>,
          or a database that has never been seeded. Locally,{" "}
          <span className="font-mono">npm run db:migrate &amp;&amp; npm run db:seed</span> fixes both.
        </p>
        {error.digest && <p className="mt-4 font-mono text-xs text-fg-3">digest {error.digest}</p>}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="feedback rounded-[3px] border border-hairline px-4 py-2 text-sm hover:border-primary hover:text-primary"
          >
            Try again
          </button>
          <Link
            href="/"
            className="feedback rounded-[3px] border border-hairline px-4 py-2 text-sm hover:border-primary hover:text-primary"
          >
            Back to the front door
          </Link>
        </div>
      </div>
    </main>
  );
}
