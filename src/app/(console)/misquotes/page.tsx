import { listMisquotes } from "@/core/db/queries";
import { MisquoteTable } from "./table";
import { PageHeading } from "../ui";

export const dynamic = "force-dynamic";

export default async function MisquotesPage() {
  const rows = await listMisquotes();
  const llm = rows.filter((r) => r.source === "llm");
  const rest = rows.filter((r) => r.source !== "llm");

  return (
    <>
      <PageHeading
        title="Misquotes"
        subtitle="Every attempt to state a price the merchant did not sign, kept with the words that produced it."
      />

      <section className="mb-12">
        <h2 className="label mb-1">From a language model · {llm.length}</h2>
        <p className="mb-4 text-xs text-fg-3">
          A real model, temperature 0.7, given a goal it could not reach honestly. Nothing instructed it to lie.
        </p>
        <MisquoteTable rows={llm} empty="Run: npm run demo:2" />
      </section>

      <section>
        <h2 className="label mb-1">From the test harness · {rest.length}</h2>
        <p className="mb-4 text-xs text-fg-3">
          Scripted violations reaching the same API, listed apart on purpose. These two counts are
          never added together.
        </p>
        <MisquoteTable rows={rest} empty="Scripted API calls land here. npm run harness drives the engine directly and writes decisions, not misquotes." />
      </section>
    </>
  );
}
