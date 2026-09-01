// A speed bump on the money routes, not a wall.
//
// maxOrdersPerHour is a policy rule inside the engine: it counts rows that became orders, and it is
// evaluated at rule 12, after signature verification and a dozen database reads. It therefore does
// nothing about quote flooding or refused-pay flooding, which are the two cheap ways to hurt this
// deployment — every quote writes an offers row AND an audit row, and the audit chain takes one
// global advisory lock, so a fast enough loop serialises the whole thing for everyone.
//
// ponytail: in-memory, per instance. On Vercel that means N warm instances get N buckets, so this
// raises the cost of an attack rather than capping it. A shared counter needs Redis or a table, and
// a table would put a write on the path this exists to protect. Swap it if there is ever a tenant
// worth the round trip.
interface Window {
  hits: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Bounded so a key space an attacker controls cannot grow the map without limit. */
const MAX_KEYS = 10_000;

export interface Limit {
  ok: boolean;
  /** Seconds until the window rolls over. Goes straight into Retry-After. */
  retryAfter: number;
}

/**
 * One fixed window per key. Fixed rather than sliding on purpose: a sliding window needs the
 * timestamps kept, and the whole point of this file is that it costs nothing to consult.
 */
export function take(key: string, limit: number, windowMs: number, now = Date.now()): Limit {
  const found = windows.get(key);

  if (!found || now >= found.resetAt) {
    // Cheapest possible eviction: when the map is full, drop everything already expired, and if
    // that frees nothing, drop the map. Losing counters fails open, which for a speed bump is the
    // right direction — the alternative is refusing legitimate callers to protect a Map.
    if (windows.size >= MAX_KEYS) {
      for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
      if (windows.size >= MAX_KEYS) windows.clear();
    }
    windows.set(key, { hits: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  found.hits += 1;
  if (found.hits <= limit) return { ok: true, retryAfter: 0 };

  return { ok: false, retryAfter: Math.max(1, Math.ceil((found.resetAt - now) / 1000)) };
}

/** Tests need a clean slate; nothing in the app should ever call this. */
export function resetLimits(): void {
  windows.clear();
}
