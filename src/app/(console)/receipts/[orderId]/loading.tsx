import { Skeleton } from "@/components/ui/skeleton";

/**
 * This route re-verifies a signature and walks the audit chain before it can render, so the wait is
 * real. The stand-in is its own shape: heading, the four facts, then the panel of six blocks.
 */
export default function ReceiptLoading() {
  return (
    <div className="page-enter flex flex-1 flex-col lg:min-h-0">
      <header className="mb-5">
        <Skeleton className="h-9 w-72 max-w-full rounded-[3px]" />
        <Skeleton className="mt-2 h-4 w-[26rem] max-w-full rounded-[3px]" />
      </header>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[3px] border border-hairline p-4">
            <Skeleton className="h-3 w-36 rounded-[2px]" />
            <Skeleton className="mt-3 h-10 w-36 rounded-[3px]" />
            <div className="mt-4 flex flex-col">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-b-0">
                  <Skeleton className="h-3 w-24 rounded-[2px]" />
                  <Skeleton className="h-3 w-16 rounded-[2px]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-3 flex flex-1 flex-col rounded-[3px] border border-hairline lg:min-h-0">
        <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-hairline px-4 py-3.5">
          <Skeleton className="h-3 w-56 rounded-[2px]" />
          <Skeleton className="h-3 w-4 rounded-[2px]" />
        </header>
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 rounded-[3px] border border-hairline px-5 py-4">
              <Skeleton className="h-4 w-64 max-w-full rounded-[2px]" style={{ opacity: 1 - i * 0.12 }} />
              <Skeleton className="h-3 w-24 shrink-0 rounded-[2px]" style={{ opacity: 1 - i * 0.12 }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
