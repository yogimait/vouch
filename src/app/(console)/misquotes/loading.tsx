import { Skeleton } from "@/components/ui/skeleton";

/** Two table blocks, not one panel: this route scrolls its whole body, and the swap must not move it. */
export default function MisquotesLoading() {
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
            <Skeleton className="mt-3 h-9 w-32 rounded-[3px]" />
            <div className="mt-4 flex flex-col gap-2">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-24 shrink-0 rounded-[2px]" />
                  <Skeleton className="h-[3px] flex-grow rounded-[1px]" />
                  <Skeleton className="h-3 w-6 shrink-0 rounded-[2px]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 lg:min-h-0 lg:overflow-hidden">
        {[6, 4].map((rows, s) => (
          <section key={s} className={s === 0 ? "mt-6 mb-12" : ""}>
            <Skeleton className="h-3 w-52 rounded-[2px]" />
            <Skeleton className="mt-2 mb-4 h-3 w-[28rem] max-w-full rounded-[2px]" />
            {Array.from({ length: rows }, (_, i) => (
              <Skeleton key={i} className="mb-3 h-9 w-full rounded-[2px]" style={{ opacity: 1 - i * 0.14 }} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
