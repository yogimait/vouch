import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for: a heading, a row of four summary cards, then the ledger panel taking
 * the rest of the height. A generic bar-stack skeleton promised a layout this route does not have,
 * so the swap to real content moved everything on screen.
 */
export default function DecisionsLoading() {
  return (
    <div className="page-enter flex flex-1 flex-col lg:min-h-0">
      <header className="mb-6">
        <Skeleton className="h-9 w-52 rounded-[3px]" />
        <Skeleton className="mt-2 h-4 w-[30rem] max-w-full rounded-[3px]" />
      </header>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[3px] border border-hairline p-4">
            <Skeleton className="h-3 w-28 rounded-[2px]" />
            <Skeleton className="mt-3 h-10 w-28 rounded-[3px]" />
            <div className="mt-4 flex flex-col gap-2">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-20 shrink-0 rounded-[2px]" />
                  <Skeleton className="h-[3px] flex-grow rounded-[1px]" />
                  <Skeleton className="h-3 w-6 shrink-0 rounded-[2px]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-3 flex flex-1 flex-col rounded-[3px] border border-hairline lg:min-h-0">
        <div className="shrink-0 border-b border-hairline px-4 py-3.5">
          <Skeleton className="h-3 w-96 max-w-full rounded-[2px]" />
        </div>
        <div className="flex-1 px-3 pt-3 lg:min-h-0 lg:overflow-hidden">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="mb-3 h-10 w-full rounded-[2px]" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      </section>
    </div>
  );
}
