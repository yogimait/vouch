import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for: heading, the standing quadrant, the control strip, then the
 * two stock panels side by side. A generic stack would move everything on screen at the swap.
 */
export default function LiveLoading() {
  return (
    <div className="page-enter flex flex-1 flex-col lg:min-h-0">
      <header className="mb-5">
        <Skeleton className="h-9 w-24 rounded-[3px]" />
        <Skeleton className="mt-2 h-4 w-[42rem] max-w-full rounded-[3px]" />
      </header>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[3px] border border-hairline p-4">
            <Skeleton className="h-3 w-24 rounded-[2px]" />
            <Skeleton className="mt-3 h-10 w-28 rounded-[3px]" />
            <Skeleton className="mt-3 h-3 w-36 rounded-[2px]" />
          </div>
        ))}
      </div>

      <div className="mt-6 mb-4 flex items-center justify-between border-y border-hairline py-3">
        <Skeleton className="h-4 w-72 max-w-full rounded-[2px]" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-20 rounded-[2px]" />
          <Skeleton className="h-9 w-32 rounded-[2px]" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((panel) => (
          <section key={panel} className="rounded-[3px] border border-hairline">
            <div className="border-b border-hairline px-4 py-3.5">
              <Skeleton className="h-3 w-40 rounded-[2px]" />
            </div>
            <div className="p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <Skeleton className="h-3 w-[7.5rem] shrink-0 rounded-[2px]" />
                  <Skeleton className="h-[3px] flex-1 rounded-[1px]" />
                  <Skeleton className="h-3 w-8 shrink-0 rounded-[2px]" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
