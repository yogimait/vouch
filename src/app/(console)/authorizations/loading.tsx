import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for: heading, four summary cards, then the mandate panel — a
 * wide capacity bar over two columns of fields. A generic bar-stack promised a layout this route
 * does not have, so the swap to real content moved everything on screen.
 */
export default function AuthorizationsLoading() {
  return (
    <div className="page-enter flex flex-1 flex-col lg:min-h-0">
      <header className="mb-6">
        <Skeleton className="h-9 w-64 rounded-[3px]" />
        <Skeleton className="mt-2 h-4 w-[32rem] max-w-full rounded-[3px]" />
      </header>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[3px] border border-hairline p-4">
            <Skeleton className="h-3 w-28 rounded-[2px]" />
            <Skeleton className="mt-3 h-10 w-24 rounded-[3px]" />
            <div className="mt-4 flex flex-col gap-3">
              {[0, 1].map((r) => (
                <div key={r}>
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-3 w-20 rounded-[2px]" />
                    <Skeleton className="h-3 w-14 rounded-[2px]" />
                  </div>
                  <Skeleton className="mt-1.5 h-[3px] w-full rounded-[1px]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-3 flex flex-1 flex-col rounded-[3px] border border-hairline lg:min-h-0">
        <div className="shrink-0 border-b border-hairline px-4 py-3.5">
          <Skeleton className="h-3 w-72 max-w-full rounded-[2px]" />
        </div>
        <div className="flex-1 lg:min-h-0 lg:overflow-hidden">
          {[0, 1].map((i) => (
            <div key={i} className="border-b border-hairline px-4 py-6" style={{ opacity: 1 - i * 0.35 }}>
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <Skeleton className="h-3 w-56 rounded-[2px]" />
                <Skeleton className="h-3 w-48 rounded-[2px]" />
              </div>
              <Skeleton className="h-[7.5rem] w-full rounded-[3px]" />
              <div className="mt-6 grid gap-x-12 gap-y-3 md:grid-cols-2">
                {Array.from({ length: 10 }, (_, f) => (
                  <Skeleton key={f} className="h-3.5 w-full rounded-[2px]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
