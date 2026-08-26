import { Nav } from "./nav";

/**
 * From lg up the console owns the viewport: nothing scrolls the page, and each route decides what
 * scrolls inside it, so a heading and its summary cards stay put while a long ledger runs under
 * them. Below lg the page scrolls normally — four stacked cards are taller than a phone on their
 * own, and pinning the height there left the ledger no room at all. Bottom padding clears the dock.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-5 pt-8 pb-28 sm:px-8 lg:overflow-hidden lg:pb-24">
        {children}
      </div>
      <Nav />
    </div>
  );
}
