import { listAuthorizations } from "@/core/db/queries";
import { formatInr } from "@/core/money";
import { CapacityBar } from "./capacity-bar";
import { Empty, Field, Id, PageHeading } from "../ui";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function AuthorizationsPage() {
  const auths = await listAuthorizations();

  return (
    <>
      <PageHeading title="Authorizations" subtitle="What one human delegated to one agent, and how much of it is left." />

      {auths.length === 0 ? (
        <Empty title="No authorizations yet." hint="Run: npm run db:seed" />
      ) : (
        auths.map((a) => (
          <article key={a.id} className="mb-12">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <Id value={a.id} head={12} tail={7} />
                <span className="text-xs tracking-wide text-admit uppercase">{a.status}</span>
              </div>
              <span className="text-xs text-fg-3">expires {a.expireAt.toISOString().slice(0, 10)}</span>
            </div>
            <p className="mb-6 text-sm text-fg-2">
              {a.agentName} — acting for <span className="font-mono">{a.principalRef}</span>
            </p>

            <CapacityBar
              maxPaise={a.maxAmountPaise}
              debitedPaise={a.debitedPaise}
              heldPaise={a.heldPaise}
              availablePaise={a.availablePaise}
            />

            <div className="mt-8 grid gap-x-12 gap-y-1 md:grid-cols-2">
              <section>
                <h2 className="label mb-2">The grant</h2>
                <Field label="granted_by">{a.grantedBy}</Field>
                <Field label="granted_via">{a.grantedVia}</Field>
                <Field label="granted_at">{a.grantedAt.toISOString().slice(0, 16).replace("T", " ")}</Field>
                <Field label="token_type">{a.tokenType}</Field>
                <Field label="frequency">{a.frequency}</Field>
                <Field label="signature"><Id value={a.grantSignature} /></Field>
              </section>
              <section>
                <h2 className="label mb-2">The scope</h2>
                <Field label="max_per_order">{formatInr(a.maxPerOrderPaise)}</Field>
                <Field label="max_orders_per_hour">{a.maxOrdersPerHour}</Field>
                <Field label="allowed_categories">{a.allowedCategories.join(", ") || "—"}</Field>
                <Field label="allowed_skus">{a.allowedSkus.join(", ") || "any within category"}</Field>
              </section>
            </div>
          </article>
        ))
      )}
    </>
  );
}
