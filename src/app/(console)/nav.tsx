import { Bot, ChartColumn, FlaskConical, Gavel, KeyRound, ReceiptText, ShieldCheck, TriangleAlert } from "lucide-react";
import { FloatingDock, type DockItem } from "@/components/ui/floating-dock";

// Order is the story: an agent acts, the gate decides, the mandate is drawn down, evidence is filed.
const ITEMS: DockItem[] = [
  { title: "Vouch", href: "/", icon: <ShieldCheck className="size-full" /> },
  { title: "Agent", href: "/agent", icon: <Bot className="size-full" /> },
  { title: "Demo", href: "/demo", icon: <FlaskConical className="size-full" /> },
  { title: "Decisions", href: "/decisions", icon: <Gavel className="size-full" /> },
  { title: "Authorizations", href: "/authorizations", icon: <KeyRound className="size-full" /> },
  { title: "Receipts", href: "/receipts", icon: <ReceiptText className="size-full" /> },
  { title: "Misquotes", href: "/misquotes", icon: <TriangleAlert className="size-full" /> },
  { title: "Metrics", href: "/metrics", icon: <ChartColumn className="size-full" /> },
];

export function Nav() {
  return (
    <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center max-md:right-6 max-md:left-auto">
      <FloatingDock items={ITEMS} />
    </div>
  );
}
