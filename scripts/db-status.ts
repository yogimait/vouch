import { sql } from "drizzle-orm";
import { getDb } from "@/core/db";
import { verifyChain } from "@/core/audit/chain";
import { formatInr } from "@/core/money";

const db = getDb();
const counts = (await db.execute(sql`
  select 'merchants' t, count(*)::text c from merchants
  union all select 'buyer_agents', count(*)::text from buyer_agents
  union all select 'catalog_items', count(*)::text from catalog_items
  union all select 'authorizations', count(*)::text from authorizations
  union all select 'audit_log', count(*)::text from audit_log
  order by t
`)) as unknown as { t: string; c: string }[];
for (const r of counts) console.log(`  ${r.t.padEnd(16)} ${r.c}`);

const [auth] = (await db.execute(sql`
  select max_amount_paise::text m, max_per_order_paise::text p, status, expire_at
  from authorizations limit 1
`)) as unknown as Record<string, string>[];
console.log(`\nauthorization: ${formatInr(BigInt(auth.m))} max, ${formatInr(BigInt(auth.p))} per order, ${auth.status}`);

const chain = await verifyChain();
console.log(`audit chain: valid=${chain.valid} rows=${chain.rowsChecked} brokenAt=${chain.brokenAt}`);
console.log(`head: ${chain.headHash.slice(0, 16)}...`);
process.exit(chain.valid ? 0 : 1);
