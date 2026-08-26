import { gateBreakdown, settlementTotals } from "@/core/db/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GateTable } from "./gate";
import { PageHeading, StatTile } from "../ui";
import { formatInr } from "@/core/money";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const [gate, settled] = await Promise.all([gateBreakdown(), settlementTotals()]);
  const sources = [...new Set(gate.map((r) => r.source))];

  return (
    <>
      <PageHeading
        title="Metrics"
        subtitle="Gate numbers and settlement numbers, in that order, and never as one figure."
      />

      <section className="mb-14">
        <h2 className="label mb-1">The gate · decisions</h2>
        <p className="mb-5 max-w-[60rem] text-xs text-fg-3">
          What the engine decided, in tabs by source, because a scripted violation and a
          model&rsquo;s attempt are not the same evidence. The two p50s measure different things and
          are not comparable: <span className="font-mono">harness</span> times the engine alone,{" "}
          <span className="font-mono">http</span> times a full admission including the database reads
          that assemble its context.
        </p>
        {sources.length > 0 && (
          <Tabs defaultValue={sources[0]}>
            <TabsList>
              {sources.map((s) => <TabsTrigger key={s} value={s} className="font-mono text-xs">{s}</TabsTrigger>)}
            </TabsList>
            {sources.map((s) => (
              <TabsContent key={s} value={s} className="mt-4">
                <GateTable rows={gate} source={s} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </section>

      <section>
        <h2 className="label mb-1">Settlement · money</h2>
        <p className="mb-5 text-xs text-fg-3">
          What actually moved through Razorpay. A different question, a different table.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatTile label="orders" value={String(settled.attempted)} />
          <StatTile label="paid" value={String(settled.paid)} accent="ADMIT" />
          <StatTile label="failed" value={String(settled.failed)} accent="REFUSE" />
          <StatTile label="debited" value={formatInr(settled.debitedPaise)} />
          <StatTile label="released" value={formatInr(settled.releasedPaise)} />
        </div>
      </section>
    </>
  );
}
