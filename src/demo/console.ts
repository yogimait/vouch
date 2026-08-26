// Everything the demo page needs, in one read. Keeps the page inside its line budget and keeps the
// queries next to the demo they serve rather than in the shared query module.
import { formatInr } from "@/core/money";
import { getCatalog } from "@/core/tools";
import { listAuthorizations, listReceipts } from "@/core/db/queries";
import { demoAgent } from "@/demo/agents";
import type { Item } from "@/app/(console)/demo/buy-panel";
import type { Settled } from "@/app/(console)/demo/receipt-panel";

export interface ConsoleData {
  items: Item[];
  settled: Settled[];
  headroom: string;
  maxPerOrder: string;
}

export async function demoConsole(): Promise<ConsoleData> {
  const agent = await demoAgent("shopbot");
  const [catalog, receipts, auths] = await Promise.all([
    getCatalog({ agentId: agent.id, source: "http" }),
    listReceipts(20),
    listAuthorizations(),
  ]);

  const mine = auths.find((a) => a.agentName === agent.name) ?? auths[0];

  return {
    items: catalog.items.map((i) => ({
      sku: i.sku, name: i.name, category: i.category, price: i.unit_price_display,
    })),
    settled: receipts.map((r) => ({
      orderId: r.orderId,
      label: `${r.sku} × ${r.qty} · ${formatInr(r.amountPaise)} · ${r.signedAt.toISOString().slice(0, 10)}`,
    })),
    headroom: mine ? formatInr(mine.availablePaise) : "—",
    maxPerOrder: mine ? formatInr(mine.maxPerOrderPaise) : "—",
  };
}
