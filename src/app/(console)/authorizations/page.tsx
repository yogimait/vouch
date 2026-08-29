import { authorizationsOverview } from "@/core/db/overview/authorizations";
import { DataTable } from "@/components/data-table";
import { AuthorizationCards } from "./cards";
import { MANDATE_COLUMNS } from "./columns";
import { Empty, ScrollPanel } from "../ui";
import { Summary } from "../summary";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function AuthorizationsPage() {
  const overview = await authorizationsOverview();

  return (
    <>
      <Summary
        title="Authorizations"
        subtitle="What each human delegated to one agent, and how much of it is left."
      >
        <AuthorizationCards overview={overview} />
      </Summary>

      <ScrollPanel title="One mandate per row — open one for its grant and its scope" count={overview.mandates.length}>
        <DataTable
          fill
          columns={MANDATE_COLUMNS}
          rows={overview.mandates}
          rowKey={(m) => m.id}
          empty={<Empty title="No authorizations yet." hint="Run: npm run db:seed" />}
        />
      </ScrollPanel>
    </>
  );
}
