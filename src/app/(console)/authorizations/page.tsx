import { authorizationsOverview } from "@/core/db/overview/authorizations";
import { MandateDetail } from "./capacity-bar";
import { AuthorizationCards } from "./cards";
import { Empty, PageHeading, ScrollPanel } from "../ui";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function AuthorizationsPage() {
  const overview = await authorizationsOverview();

  return (
    <>
      <PageHeading title="Authorizations" subtitle="What each human delegated to one agent, and how much of it is left." />
      <AuthorizationCards overview={overview} />

      <ScrollPanel title="Every mandate, its grant and its scope" count={overview.mandates.length}>
        <div className="lg:h-full lg:overflow-y-auto">
          {overview.mandates.length === 0 ? (
            <div className="p-4"><Empty title="No authorizations yet." hint="Run: npm run db:seed" /></div>
          ) : (
            overview.mandates.map((m) => <MandateDetail key={m.id} m={m} />)
          )}
        </div>
      </ScrollPanel>
    </>
  );
}
