// The agent's only way to reach the merchant. It cannot import @/core — ESLint fails the build on
// it — so everything here goes over HTTP exactly as a third-party agent's would.
//
// Enforcement the agent can bypass is not enforcement. This file is why that sentence is true here.

export interface Envelope<T> {
  status: boolean;
  statusCode: number;
  data?: T;
  message?: string;
  error?: { code: string; details?: Record<string, unknown> };
}

export interface AgentConfig {
  baseUrl: string;
  apiKey: string;
  /** Labels the decision row for reporting only. It never reaches a rule. */
  source: "llm" | "harness" | "http";
}

/** Mutable so the tool loop can attach whatever the model said just before it called a tool. */
export interface Narration {
  lastText: string;
}

export class MerchantClient {
  constructor(private readonly config: AgentConfig, readonly narration: Narration = { lastText: "" }) {}

  private async call<T>(path: string, body?: unknown): Promise<Envelope<T>> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "x-vouch-source": this.config.source,
        connection: "close",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return (await res.json()) as Envelope<T>;
  }

  catalog() {
    return this.call<{ items: CatalogRow[] }>("/api/catalog");
  }

  quote(input: { sku: string; qty: number; discount_code?: string }) {
    return this.call<QuoteRow>("/api/quote", { ...input, raw_agent_text: this.narration.lastText.slice(0, 8000) });
  }

  pay(input: { offer_token: string; idempotency_key: string; claimed_total_paise?: string }) {
    return this.call<PaidRow>("/api/pay", { ...input, raw_agent_text: this.narration.lastText.slice(0, 8000), label: "demo2" });
  }

  receipt(orderId: string) {
    return this.call<{ verification: { valid: boolean } }>(`/api/orders/${orderId}/receipt`);
  }
}

export interface CatalogRow {
  sku: string;
  name: string;
  category: string;
  unit_price_paise: string;
  unit_price_display: string;
  inventory: number;
  promo_text: string | null;
}

export interface QuoteRow {
  offer_id: string;
  offer_token: string;
  total_paise: string;
  total_display: string;
  expires_at: string;
}

export interface PaidRow {
  order_id: string;
  amount_paise: string;
  authorization_url?: string;
  payment_link?: string;
  decision_id: string;
}
