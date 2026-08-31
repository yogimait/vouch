import type { ReactNode } from "react";
import { BLOCK_NAMES, type BlockName } from "@/core/receipts/build";
import { formatInr } from "@/core/money";
import { TONE, type Tone } from "../format";

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

// The receipt mixes snake_case (the blocks) with camelCase (the embedded policy snapshot), so both
// spellings of the same suffix have to be recognised or half the money renders as digits.
const MONEY = /(_paise|Paise)$/;
const MOMENT = /(_at|At)$/;
const MISSING = "not recorded";

// The unit is dropped from the label because the value already carries a rupee sign.
function label(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase().replace(/ paise$/, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Long hashes, tokens and signatures are evidence, not reading matter: both ends, middle elided. */
function shorten(v: string): string {
  return v.length <= 44 ? v : `${v.slice(0, 22)}…${v.slice(-14)}`;
}

function scalar(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return MISSING;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return JSON.stringify(v);
  if (MONEY.test(key) && /^\d+$/.test(v)) return formatInr(BigInt(v));
  if (MOMENT.test(key) && /^\d{4}-\d\d-\d\dT/.test(v)) return v.slice(0, 16).replace("T", " ");
  return shorten(v);
}

function Row({ name, children, title }: { name: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-2 last:border-b-0">
      <span className="label shrink-0">{name}</span>
      <span className="min-w-0 text-right font-mono text-[13px] break-words" title={title}>{children}</span>
    </div>
  );
}

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="border-b border-hairline py-2 last:border-b-0">
      <div className="label">{name}</div>
      <div className="mt-1 border-l border-hairline pl-3">{children}</div>
    </div>
  );
}

/** Depth is bounded because the receipt is: three levels reaches every leaf the builder writes. */
function Fields({ data, depth = 0 }: { data: Record<string, unknown>; depth?: number }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="py-2 text-[13px] text-fg-3">Empty.</p>;

  return (
    <div className="flex flex-col">
      {entries.map(([key, value]) => {
        if (Array.isArray(value)) {
          if (value.length === 0) return <Row key={key} name={label(key)}><span className="text-fg-3">none</span></Row>;
          if (value.every((v) => !isRecord(v))) {
            return <Row key={key} name={label(key)}>{value.map((v) => scalar(key, v)).join(" · ")}</Row>;
          }
          return (
            <Group key={key} name={`${label(key)} · ${value.length}`}>
              {value.map((v, i) => (
                <Fields key={i} data={v as Record<string, unknown>} depth={depth + 1} />
              ))}
            </Group>
          );
        }

        if (isRecord(value)) {
          if (depth >= 2) return <Row key={key} name={label(key)}>{JSON.stringify(value)}</Row>;
          return (
            <Group key={key} name={label(key)}>
              <Fields data={value} depth={depth + 1} />
            </Group>
          );
        }

        const text = scalar(key, value);
        const full = typeof value === "string" && value !== text ? value : undefined;
        // The verdict is the one field in the receipt that is the product's own vocabulary.
        const tone = key === "outcome" && text in TONE ? TONE[text as Tone].text : "";
        return (
          <Row key={key} name={label(key)} title={full}>
            {text === MISSING ? <span className="text-fg-3">{MISSING}</span> : <span className={tone}>{text}</span>}
          </Row>
        );
      })}
    </div>
  );
}

interface Props {
  blocks: Record<string, Record<string, unknown>>;
  hashes: Record<string, string>;
  tampered: string[];
}

export function Blocks({ blocks, hashes, tampered }: Props) {
  return (
    // Two across, so all six of the chain are on screen at once — stacked, the panel showed three
    // and the point of the page is that there are six. The open one takes the full width back,
    // because a signature and a policy snapshot do not read in a half column.
    <div className="grid gap-2 lg:grid-cols-2">
      {BLOCK_NAMES.map((name) => {
        const broken = tampered.includes(name);
        return (
          <details key={name} className="h-fit rounded-[3px] border border-hairline px-5 py-4 lg:open:col-span-2">
            <summary className="flex cursor-pointer flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <span className="min-w-0">
                <span className={`font-mono text-sm ${broken ? "text-refuse" : "text-fg"}`}>{name}</span>
                <span className="ml-3 text-xs text-fg-3">{QUESTION[name]}</span>
              </span>
              <span className={`font-mono text-xs ${broken ? "text-refuse" : "text-fg-3"}`}>
                {broken ? "ALTERED" : `${hashes[name]?.slice(0, 12)}…`}
              </span>
            </summary>

            <div className="mt-4 border-t border-hairline pt-2">
              <Fields data={blocks[name] ?? {}} />
            </div>

            {/* The formatted view is for reading; the hash was taken over these bytes, so they stay. */}
            <details className="mt-3 border-t border-hairline pt-3">
              <summary className="label cursor-pointer">the exact bytes that were hashed</summary>
              <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed text-fg-2">
                {JSON.stringify(blocks[name], null, 2)}
              </pre>
            </details>
          </details>
        );
      })}
    </div>
  );
}
