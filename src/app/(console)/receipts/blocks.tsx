import { BLOCK_NAMES, type BlockName } from "@/core/receipts/build";

// Native <details>, not a JS disclosure component. It is keyboard accessible, works with find-in-page
// and prints expanded — three things a div-and-useState version would have to earn back.
const QUESTION: Record<BlockName, string> = {
  authorization: "Who delegated this authority, and when?",
  policy: "What rules were in force at the moment of the decision?",
  offer: "What price did the merchant actually sign?",
  decision: "Did the agent stay inside its authority?",
  payment: "Did the money move, and against which bytes?",
  audit: "Where does this sit in the tamper-evident chain?",
};

interface Props {
  blocks: Record<string, Record<string, unknown>>;
  hashes: Record<string, string>;
  tampered: string[];
}

export function Blocks({ blocks, hashes, tampered }: Props) {
  return (
    <div className="mt-8 space-y-2">
      {BLOCK_NAMES.map((name) => {
        const broken = tampered.includes(name);
        return (
          <details key={name} className="glass rounded-lg px-5 py-4">
            <summary className="flex cursor-pointer items-baseline justify-between gap-4">
              <span>
                <span className={`font-mono text-sm ${broken ? "text-refuse" : "text-fg"}`}>{name}</span>
                <span className="ml-3 text-xs text-fg-3">{QUESTION[name]}</span>
              </span>
              <span className={`font-mono text-xs ${broken ? "text-refuse" : "text-fg-3"}`}>
                {broken ? "ALTERED" : `${hashes[name]?.slice(0, 12)}…`}
              </span>
            </summary>
            <pre className="mt-4 overflow-x-auto border-t border-hairline pt-4 font-mono text-xs leading-relaxed text-fg-2">
              {JSON.stringify(blocks[name], null, 2)}
            </pre>
          </details>
        );
      })}
    </div>
  );
}
