const SURFACE = [
  ["get_catalog", "what is for sale"],
  ["get_quote", "a merchant-signed price the agent cannot alter"],
  ["pay", "admit, escalate or refuse — then an authorization URL"],
  ["get_receipt", "the dispute-grade proof"],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20 font-mono text-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Vouch</h1>
      <p className="mt-3 text-base leading-relaxed opacity-80">
        A merchant-side admission and evidence layer for AI buyers.
      </p>
      <p className="mt-6 leading-relaxed opacity-70">
        Razorpay&rsquo;s MCP server ships 45 tools. Every one authenticates as the merchant.
        None authenticates as the buyer. These four do.
      </p>

      <ul className="mt-8 space-y-2">
        {SURFACE.map(([name, what]) => (
          <li key={name} className="flex gap-3">
            <code className="w-28 shrink-0 opacity-100">{name}</code>
            <span className="opacity-60">{what}</span>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-xs leading-relaxed opacity-50">
        No LLM reaches a decision, a price, or a signature check. Every order emits a signed receipt
        proving who delegated authority, when, with what scope, and whether the agent stayed inside it.
      </p>
    </main>
  );
}
