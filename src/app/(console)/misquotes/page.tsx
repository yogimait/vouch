import { listMisquotes } from "@/core/db/queries";
import { misquotesOverview } from "@/core/db/overview/misquotes";
import { MisquoteTable } from "./table";
import { MisquoteCards } from "./cards";
import { PageHeading, PageScroll } from "../ui";

export const dynamic = "force-dynamic";

export default async function MisquotesPage() {
  // Sequential, not Promise.all: each holds a pooled connection for its whole chain, and the pool
  // is twelve. See the same note in src/core/db/queries.ts — this is the layer that kept undoing it.
  const rows = await listMisquotes();
  const overview = await misquotesOverview();
  const llm = rows.filter((r) => r.source === "llm");
  const rest = rows.filter((r) => r.source !== "llm");

  return (
    <>
      <PageHeading
        title="Misquotes"
        subtitle="Every attempt to state a price the merchant did not sign, kept with the words that produced it."
      />
      <MisquoteCards overview={overview} />

      <PageScroll>
        {/* Two tables, never one. The counts are kept apart because a model's own attempt and a
            scripted one are not the same evidence, and a reader who can add them by eye will. */}
        <section className="mt-6 mb-12">
          <h2 className="label mb-1">From an AI buyer · {llm.length}</h2>
          <p className="mb-4 text-xs text-fg-3">
            A real model, given a goal it could not reach honestly. Nothing instructed it to lie.
            The run&rsquo;s model and temperature are shown live on the Agent console.
          </p>
          <MisquoteTable rows={llm} empty="No AI buyer has stated an unsigned price yet." />
        </section>

        <section>
          <h2 className="label mb-1">From a conformance run · {rest.length}</h2>
          <p className="mb-4 text-xs text-fg-3">
            Scripted violations reaching the same API, listed apart on purpose. These two counts are
            never added together.
          </p>
          <MisquoteTable rows={rest} empty="Scripted violations land here. A conformance run drives the engine directly, which writes decisions rather than misquotes." />
        </section>
      </PageScroll>
    </>
  );
}
