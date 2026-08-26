import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for: heading, the standing quadrant, the controls, then the
 * transcript panel taking the rest. A generic stack would move everything on screen at the swap.
 */
export default function AgentLoading() {
  return (
    <div className="page-enter flex flex-1 flex-col lg:min-h-0">
      <header className="mb-5">
        <Skeleton className="h-9 w-32 rounded-[3px]" />
        <Skeleton className="mt-2 h-4 w-[38rem] max-w-full rounded-[3px]" />
      </header>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[3px] border border-hairline p-4">
            <Skeleton className="h-3 w-28 rounded-[2px]" />
            <Skeleton className="mt-3 h-10 w-32 rounded-[3px]" />
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

      <div className="mt-4 shrink-0">
        <div className="mb-3 flex gap-2">
          {[16, 20].map((w) => <Skeleton key={w} className="h-7 rounded-full" style={{ width: `${w * 4}px` }} />)}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {[28, 32, 40, 30].map((w) => <Skeleton key={w} className="h-7 rounded-full" style={{ width: `${w * 4}px` }} />)}
        </div>
        <Skeleton className="h-[4.5rem] w-full rounded-[3px]" />
        <Skeleton className="mt-3 h-9 w-28 rounded-full" />
      </div>

      <section className="mt-3 flex flex-1 flex-col rounded-[3px] border border-hairline lg:min-h-0">
        <div className="shrink-0 border-b border-hairline px-4 py-3.5">
          <Skeleton className="h-3 w-80 max-w-full rounded-[2px]" />
        </div>
        <div className="flex-1 px-4 pt-4 lg:min-h-0 lg:overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="mb-3 h-12 w-full rounded-[2px]" style={{ opacity: 1 - i * 0.18 }} />
          ))}
        </div>
      </section>
    </div>
  );
}
