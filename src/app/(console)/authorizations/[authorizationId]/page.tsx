import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authorizationsOverview } from "@/core/db/overview/authorizations";
import { formatInr } from "@/core/money";
import { MandateDetail } from "../capacity-bar";
import { PageHeading, PageScroll } from "../../ui";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function MandatePage({ params }: { params: Promise<{ authorizationId: string }> }) {
  const { authorizationId } = await params;
  // Reuses the list read on purpose: a dedicated query would be the same SQL with a where clause,
  // and a second place to keep the held/debited maths right is a second place to get it wrong.
  const { mandates } = await authorizationsOverview();
  const m = mandates.find((row) => row.id === authorizationId);

  if (!m) {
    return (
      <>
        <PageHeading title="Authorization" subtitle="No live mandate with that id." />
        <Link href="/authorizations" className="text-sm text-primary hover:underline">back to the mandates</Link>
      </>
    );
  }

  return (
    <>
      {/* The person leads. A mandate is an act of delegation, and the delegator is the subject. */}
      <PageHeading
        title={m.principalRef}
        subtitle={`delegated ${formatInr(m.maxAmountPaise)} to ${m.agentName} · ${formatInr(m.availablePaise)} of it is still spendable`}
      />
      <PageScroll>
        <MandateDetail m={m} />
        <Button asChild size="sm" variant="outline" className="rounded-[2px]">
          <Link href="/authorizations">All mandates</Link>
        </Button>
      </PageScroll>
    </>
  );
}
