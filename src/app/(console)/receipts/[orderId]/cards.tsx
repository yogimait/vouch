import type { BlockName, ReceiptBody } from "@/core/receipts/build";
import type { Verification } from "@/core/receipts/verify";
import { formatInr } from "@/core/money";
import { Big, HairRow, Note, Quadrant, StatCard } from "../../cards";
import { TONE, type Tone } from "../../format";

type Block = Record<string, unknown>;

// Every block field is nullable in the receipt: an order can settle with no decision row behind it.
// "not recorded" is the honest reading; a rendered "₹0.00" would be a number nobody ever wrote.
const MISSING = "not recorded";

function str(block: Block, key: string): string {
  const v = block[key];
  return typeof v === "string" && v.length > 0 ? v : MISSING;
}

function money(block: Block, key: string): string {
  const v = block[key];
  return typeof v === "string" && /^\d+$/.test(v) ? formatInr(BigInt(v)) : MISSING;
}

function moment(block: Block, key: string): string {
  const v = block[key];
  return typeof v === "string" ? v.slice(0, 16).replace("T", " ") : MISSING;
}

function Truth({ v }: { v: Verification }) {
  return (
    <StatCard title="Verdict" index={0}>
      <Big value={v.valid ? "Verified" : "Does not verify"} tone={v.valid ? "ADMIT" : "REFUSE"} />
      <div className="mt-4 flex flex-col">
        <HairRow name="signature" value={v.signatureValid ? "valid" : "FAILED"} />
        <HairRow name="six blocks" value={v.tamperedBlocks.length ? `ALTERED: ${v.tamperedBlocks.join(", ")}` : "intact"} />
        <HairRow
          name="audit chain"
          value={v.chain ? (v.chain.valid ? `intact · ${v.chain.rowsChecked} rows` : `BROKEN at ${v.chain.brokenAt}`) : "not anchored"}
        />
      </div>
      <Note>Re-checked on this view. A receipt nobody re-checks is a stored assertion, not evidence.</Note>
    </StatCard>
  );
}

function Delegation({ auth }: { auth: Block }) {
  return (
    <StatCard title="Who delegated this authority" index={1}>
      <Big value={money(auth, "max_amount_paise")} caption="ceiling one human set" />
      <div className="mt-4 flex flex-col">
        <HairRow name="granted by" value={str(auth, "granted_by")} />
        <HairRow name="via" value={str(auth, "granted_via")} />
        <HairRow name="granted" value={moment(auth, "granted_at")} />
      </div>
      <Note>The block is the ceiling for the whole authorization, not for this order.</Note>
    </StatCard>
  );
}

function Signed({ offer }: { offer: Block }) {
  const qty = typeof offer.qty === "number" ? offer.qty : null;

  return (
    <StatCard title="What the merchant signed" index={2}>
      <Big value={money(offer, "total_paise")} caption="the price, signed before it was paid" />
      <div className="mt-4 flex flex-col">
        <HairRow name="item" value={qty === null ? str(offer, "sku") : `${str(offer, "sku")} × ${qty}`} />
        <HairRow name="each" value={money(offer, "unit_price_paise")} />
        <HairRow name="offered" value={moment(offer, "issued_at")} />
      </div>
      <Note>The signed token itself sits in the offer block below, so a third party can re-check it.</Note>
    </StatCard>
  );
}

function Inside({ decision }: { decision: Block }) {
  const outcome = decision.outcome;
  const tone: Tone | "plain" = typeof outcome === "string" && outcome in TONE ? (outcome as Tone) : "plain";

  return (
    <StatCard title="Did the agent stay inside it" index={3}>
      <Big value={typeof outcome === "string" ? outcome : MISSING} tone={tone} caption="ruled before the money moved" />
      <div className="mt-4 flex flex-col">
        <HairRow name="available before" value={money(decision, "authorization_available_before_paise")} />
        <HairRow name="available after" value={money(decision, "authorization_available_after_paise")} />
      </div>
      <Note>
        Both balances are derived from the append-only ledger, never read from a column, and the
        difference is this order.
      </Note>
    </StatCard>
  );
}

export function ReceiptFacts({ body, verification }: { body: ReceiptBody; verification: Verification }) {
  const block = (name: BlockName): Block => body.blocks?.[name] ?? {};

  return (
    <Quadrant>
      <Truth v={verification} />
      <Delegation auth={block("authorization")} />
      <Signed offer={block("offer")} />
      <Inside decision={block("decision")} />
    </Quadrant>
  );
}
