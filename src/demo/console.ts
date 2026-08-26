// Everything the demo page needs, in one read. Keeps the page inside its line budget and keeps the
// queries next to the demo they serve rather than in the shared query module.
import { formatInr } from "@/core/money";
import { getCatalog } from "@/core/tools";
import { listReceipts } from "@/core/db/queries";
import { demoAgent } from "@/demo/agents";
import { mandateFor, type Mandate } from "@/demo/agent";
import type { Item } from "@/app/(console)/demo/buy-panel";
import type { Settled } from "@/app/(console)/demo/receipt-panel";

export interface ConsoleData {
  items: Item[];
  settled: Settled[];
}

export async function demoConsole(): Promise<ConsoleData> {
  const agent = await demoAgent("shopbot");
  const [catalog, receipts] = await Promise.all([
    getCatalog({ agentId: agent.id, source: "http" }),
    listReceipts(20),
  ]);

  return {
    items: catalog.items.map((i) => ({
      sku: i.sku, name: i.name, category: i.category, price: i.unit_price_display,
    })),
    settled: receipts.map((r) => ({
      orderId: r.orderId,
      label: `${r.sku} × ${r.qty} · ${formatInr(r.amountPaise)} · ${r.signedAt.toISOString().slice(0, 10)}`,
    })),
  };
}

/** The mandate as it stands before a run, so the page is honest on first paint. */
export async function openingMandate(): Promise<Mandate | null> {
  const agent = await demoAgent("shopbot");
  return mandateFor(agent.id);
}
