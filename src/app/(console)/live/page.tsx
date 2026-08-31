import { opsOverview } from "@/demo/ops";
import { demoEnabled } from "@/demo/route";
import { LiveOps } from "./live";

// Reads live data on every request. Without this Next prerenders it and bakes the seed in.
export const dynamic = "force-dynamic";

export default async function LivePage() {
  return <LiveOps opening={await opsOverview()} enabled={demoEnabled()} />;
}
