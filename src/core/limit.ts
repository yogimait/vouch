// A speed bump on the money routes, not a wall.
//
// maxOrdersPerHour is rule 12, after signature verification and a dozen reads, and it only counts
// rows that became orders. So it does nothing about quote flooding, the cheap way to hurt this
// deployment: every quote writes an offers row and an audit row, and the audit chain takes one
// global advisory lock.
//
// ponytail: in-memory, per instance — N warm instances get N buckets, so this raises the cost of an
// attack rather than capping it. A shared counter needs Redis; a table would put a write on the very
// path this protects.
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

/** One fixed window per key. Sliding would need the timestamps kept; this must cost nothing. */
export function take(key: string, limit: number, windowMs: number, now = Date.now()): Limit {
  const found = windows.get(key);

  if (!found || now >= found.resetAt) {
    // Cheapest eviction: drop what expired, and if that frees nothing, drop the map. Failing open is
    // right for a speed bump — the alternative is refusing real callers to protect a Map.
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
