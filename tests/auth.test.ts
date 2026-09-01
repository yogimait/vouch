// Authentication had no test at all, and it is the gate every money route sits behind.
//
// The bug this was written for: requireAgent looked a key up and handed the row back without ever
// reading agent.status, so a FROZEN agent could still browse the catalogue and have the merchant
// sign it a fresh offer token. AGENT_FROZEN is rule 1 of the engine, but the engine only runs on
// pay — revocation that takes effect only on the last call is not revocation.
import { beforeAll, describe, expect, it } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Gated below.
}

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("requireAgent", () => {
  let requireAgent: typeof import("@/core/guards").requireAgent;
  let DEMO_KEYS: typeof import("@/core/db/seed").DEMO_KEYS;

  const url = "http://localhost/api/quote";
  const bearer = (key: string) => new Request(url, { headers: { authorization: `Bearer ${key}` } });

  beforeAll(async () => {
    ({ requireAgent } = await import("@/core/guards"));
    ({ DEMO_KEYS } = await import("@/core/db/seed"));
  });

  it("lets the active agent through", async () => {
    const r = await requireAgent(bearer(DEMO_KEYS.shopbot));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe("ACTIVE");
  });

  it("refuses a frozen agent before it can be quoted a price", async () => {
    const r = await requireAgent(bearer(DEMO_KEYS.frozen));
    expect(r.ok).toBe(false);
    if (r.ok) return;

    // 403, not 401: the key is real and the caller is known. It is the agent that is revoked.
    expect(r.response.status).toBe(403);
    const body = await r.response.json();
    expect(body.error.code).toBe("AGENT_FROZEN");
    expect(body.status).toBe(false);
  });

  it("refuses a missing, malformed or unknown bearer with 401", async () => {
    const cases: [string, Request][] = [
      ["no header", new Request(url)],
      ["wrong scheme", new Request(url, { headers: { authorization: "Basic abc" } })],
      ["empty bearer", bearer("")],
      ["unknown key", bearer(`vouch_sk_not_a_real_key_${Date.now()}`)],
    ];
    for (const [name, req] of cases) {
      const r = await requireAgent(req);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.response.status, name).toBe(401);
    }
  });

  it("never reveals whether a key exists", async () => {
    // Both answer AGENT_UNKNOWN with the same status, so a caller cannot probe for valid keys.
    const unknown = await requireAgent(bearer("vouch_sk_definitely_not_issued"));
    const empty = await requireAgent(new Request(url));
    expect(unknown.ok).toBe(false);
    expect(empty.ok).toBe(false);
    if (unknown.ok || empty.ok) return;
    expect(unknown.response.status).toBe(empty.response.status);
    expect((await unknown.response.json()).error.code).toBe((await empty.response.json()).error.code);
  });
}, 30_000);
