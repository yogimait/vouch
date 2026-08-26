"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/demo", "Demo"],
  ["/decisions", "Decisions"],
  ["/authorizations", "Authorizations"],
  ["/receipts", "Receipts"],
  ["/misquotes", "Misquotes"],
  ["/metrics", "Metrics"],
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-8 z-30 flex justify-center">
      <div className="glass flex items-center gap-1 rounded-full px-3 py-2">
        <Link href="/" className="px-3 font-display text-base tracking-wide">Vouch</Link>
        <span className="mx-1 h-6 w-px bg-white/10" />
        {ITEMS.map(([href, label]) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                active ? "bg-accent font-medium text-black" : "text-fg-3 hover:text-fg"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
