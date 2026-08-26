import type { ReceiptsOverview } from "@/core/db/overview/receipts";
import { formatInr } from "@/core/money";
import { Big, BarRow, HairRow, Note, Quadrant, StatCard } from "../cards";

/** Bars over settled orders only. Failed orders are a different set and are listed, never barred. */
function Evidence({ o }: { o: ReceiptsOverview }) {
  return (
    <StatCard title="Evidence on file" index={0}>
      <Big value={o.receipts} caption="signed receipts" />
      <div className="mt-4 flex flex-col gap-2">
        <BarRow name="RECEIPTED" value={o.receipted} of={o.paid} tone="ADMIT" />
        <BarRow name="AWAITING" value={o.awaiting} of={o.paid} tone="ESCALATE" />
      </div>
      <div className="mt-3 flex flex-col">
        <HairRow name="failed, no receipt" value={o.failed} />
      </div>
      <Note>
        Both bars are shares of the {o.paid} orders that settled. A failed order is not a share of
        anything — it never reaches a receipt — so it is counted apart.
      </Note>
    </StatCard>
  );
}

/** One failure turns the whole card red: evidence is not a percentage you get to average. */
function Verifies({ verified }: { verified: ReceiptsOverview["verified"] }) {
  const allGood = verified.valid === verified.checked;

  return (
    <StatCard title="Does it still verify" index={1}>
      {verified.checked === 0 ? (
        <Big value="—" caption="nothing signed yet" />
      ) : (
        <Big
          value={`${verified.valid} / ${verified.checked}`}
          tone={allGood ? "ADMIT" : "REFUSE"}
          caption="re-checked on this request"
        />
      )}
      <Note>
        {verified.checked === 0
          ? "A receipt is verified on read, never trusted from storage. There is nothing to read yet."
          : `The ${verified.checked} most recent receipts, verified now rather than trusted from storage:
             the signature over the stored bytes, then all six block hashes recomputed. The audit-chain
             walk is not in this number — it runs on each receipt's own page.`}
      </Note>
    </StatCard>
  );
}

function Proves({ o }: { o: ReceiptsOverview }) {
  return (
    <StatCard title="What each receipt proves" index={2}>
      {o.receipts === 0 ? (
        <p className="mt-4 text-sm text-fg-3">No receipt has been issued yet.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2">
            {o.blocks.map((b) => (
              <BarRow key={b.name} name={b.name} value={b.n} of={o.receipts} mono />
            ))}
          </div>
          <div className="mt-3 flex flex-col">
            <HairRow name="anchored to the chain" value={o.anchored} />
          </div>
        </>
      )}
      <Note>Six blocks, hashed one by one, so a tamper report names the block and not the file.</Note>
    </StatCard>
  );
}

/** Settlement money only. formatInr runs here, on the server, so no bigint crosses to the client. */
function Value({ o }: { o: ReceiptsOverview }) {
  return (
    <StatCard title="Receipted value by agent" index={3}>
      {o.receipts === 0 ? (
        <Big value="—" caption="nothing has settled" />
      ) : (
        <Big value={formatInr(o.receiptedPaise)} caption="money that moved, with proof" />
      )}
      <div className="mt-3 flex flex-col">
        {o.byAgent.map((a) => (
          <HairRow key={a.agent} name={a.agent} value={formatInr(a.paise)} />
        ))}
      </div>
      <Note>
        Settlement, not admission. No decision count belongs on this card: the gate also ruled on
        attempts that never became an order, and those two totals answer different questions.
      </Note>
    </StatCard>
  );
}

export function ReceiptCards({ overview }: { overview: ReceiptsOverview }) {
  return (
    <Quadrant>
      <Evidence o={overview} />
      <Verifies verified={overview.verified} />
      <Proves o={overview} />
      <Value o={overview} />
    </Quadrant>
  );
}
