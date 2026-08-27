"use client";

/**
 * Scoped to the console so a failing route keeps the shell and the dock — the root boundary replaces
 * the whole page, which on /agent or /demo leaves a judge with no way back to the other six routes.
 */

import Link from "next/link";
import { PageHeading } from "./ui";

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <PageHeading title="This route did not render" subtitle="The rest of the console is still reachable from the dock." />

      <div className="rounded-[3px] border border-refuse/40 p-6">
        <p className="text-sm leading-relaxed text-fg-2">
          Usually the database, not the page: <span className="font-mono">getDb()</span> throws without
          a <span className="font-mono">DATABASE_URL</span>, and the agent routes throw when nothing has
          been seeded. Run <span className="font-mono">npm run db:migrate &amp;&amp; npm run db:seed</span>,
          then try again.
        </p>
        {error.digest && <p className="mt-4 font-mono text-xs text-fg-3">digest {error.digest}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="feedback rounded-[3px] border border-hairline px-4 py-2 text-sm hover:border-primary hover:text-primary"
          >
            Try again
          </button>
          <Link
            href="/decisions"
            className="feedback rounded-[3px] border border-hairline px-4 py-2 text-sm hover:border-primary hover:text-primary"
          >
            Open the decisions log
          </Link>
        </div>
      </div>
    </>
  );
}
