import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for: heading, the four stage-setting cards, then the acts
 * scrolling underneath. A generic stack promised a layout this route does not have, so the swap to
 * real content moved everything on screen.
 */
export default function DemoLoading() {
  return (
    <div className="page-enter flex flex-1 flex-col lg:min-h-0">
      <header className="mb-5">
        <Skeleton className="h-9 w-56 rounded-[3px]" />
        <Skeleton className="mt-2 h-4 w-[34rem] max-w-full rounded-[3px]" />
      </header>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[3px] border border-hairline p-4">
            <Skeleton className="h-3 w-32 rounded-[2px]" />
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

      <div className="flex-1 lg:min-h-0 lg:overflow-hidden">
        <div className="mt-6 mb-12 flex items-center justify-between gap-4 border-y border-hairline py-4">
          <Skeleton className="h-4 w-96 max-w-full rounded-[2px]" />
          <Skeleton className="h-9 w-36 shrink-0 rounded-[2px]" />
        </div>

        {[0, 1].map((i) => (
          <section key={i} className="mb-16">
            <div className="mb-5 flex items-baseline gap-4">
              <Skeleton className="h-8 w-8 shrink-0 rounded-[3px]" />
              <div className="flex-1">
                <Skeleton className="h-6 w-48 rounded-[3px]" />
                <Skeleton className="mt-2 h-4 w-[28rem] max-w-full rounded-[2px]" />
              </div>
            </div>
            <Skeleton className="h-44 w-full rounded-[3px]" style={{ opacity: 1 - i * 0.4 }} />
          </section>
        ))}
      </div>
    </div>
  );
}
