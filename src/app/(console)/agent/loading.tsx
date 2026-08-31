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

      {/* The two agent chips, the errand as two lines of prose, one button, then the collapsed
          disclosure. The preset chips and the textarea are inside it, so they are not stood in for —
          a skeleton promising a box the page no longer opens with moves everything at the swap. */}
      <div className="mt-4 shrink-0">
        <div className="mb-4 flex gap-2">
          {[16, 20].map((w) => <Skeleton key={w} className="h-7 rounded-[2px]" style={{ width: `${w * 4}px` }} />)}
        </div>
        <Skeleton className="h-3 w-20 rounded-[2px]" />
        <Skeleton className="mt-2 h-4 w-full rounded-[2px]" />
        <Skeleton className="mt-1.5 h-4 w-3/4 rounded-[2px]" />
        <Skeleton className="mt-3 h-9 w-28 rounded-[2px]" />
        <Skeleton className="mt-4 h-3 w-56 rounded-[2px]" />
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
