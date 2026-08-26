// Demo 5, as something a viewer can do rather than watch: edit one field of a signed receipt and
// see which block is named. Nothing is written back — the stored receipt is never touched.
import { z } from "zod";
import { canonicalJson } from "@/core/canonical";
import { verifyBundle, verifyStored, type Verification } from "@/core/receipts/verify";
import { TAMPER_TARGETS } from "@/demo/targets";


export const TamperRequest = z.object({
  orderId: z.string().min(1).max(64),
  path: z.string().min(1).max(120),
  value: z.string().max(200),
});

export interface TamperResult {
  ok: true;
  before: Verification;
  after: Verification;
  path: string;
  was: string;
  now: string;
}

export async function tamperReceipt(
  input: z.infer<typeof TamperRequest>,
): Promise<TamperResult | { ok: false; code: string }> {
  const { orderId, path, value } = input;
  if (!TAMPER_TARGETS.some((t) => t.path === path)) return { ok: false, code: "UNKNOWN_FIELD" };

  const loaded = await verifyStored(orderId);
  if (!loaded.ok) return { ok: false, code: loaded.code };

  const body = JSON.parse(loaded.bundle.receipt) as Record<string, unknown>;
  const was = String(readAt(body, path) ?? "");
  writeAt(body, path, value);

  // Re-signed with nothing: the point is that editing the bytes is easy and passing verification
  // is not. The signature travels in the bundle unchanged.
  const after = verifyBundle({ ...loaded.bundle, receipt: canonicalJson(body) });

  return { ok: true, before: loaded.verification, after, path, was, now: value };
}

function walk(body: Record<string, unknown>, dotted: string): [Record<string, unknown>, string] {
  const keys = dotted.split(".");
  let node = body;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  return [node, keys.at(-1)!];
}

function readAt(body: Record<string, unknown>, dotted: string): unknown {
  const [node, key] = walk(body, dotted);
  return node?.[key];
}

function writeAt(body: Record<string, unknown>, dotted: string, next: string): void {
  const [node, key] = walk(body, dotted);
  node[key] = next;
}
