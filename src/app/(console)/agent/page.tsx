import { PageHeading } from "../ui";
import { AgentConsole } from "./console";
import { PRESETS } from "@/demo/instructions";
import { openingMandate } from "@/demo/console";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const mandate = await openingMandate();

  return (
    <>
      <PageHeading
        title="Agent"
        subtitle="Tell the buyer agent what to do. It reaches the merchant over HTTP exactly as any third party would."
      />

      <p className="mb-8 max-w-[52rem] text-sm leading-relaxed text-fg-2">
        The agent holds an API key and no payment credential. It cannot import the guard — that is an
        ESLint rule, so a build fails on it rather than a review catching it. Everything below is the
        model&rsquo;s own reasoning, its real tool calls, and the merchant&rsquo;s real answers.
      </p>

      <AgentConsole presets={PRESETS} mandate={mandate} />
    </>
  );
}
