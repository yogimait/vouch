import { Skeleton } from "@/components/ui/skeleton";

/**
 * The fallback for routes that have not been given their own shaped skeleton yet. It promises only
 * what every console route has — a heading and a panel — because a skeleton that promises cards a
 * route does not have makes the swap to real content move everything on screen.
 */
export default function ConsoleLoading() {
  return (
    <div className="page-enter flex flex-1 flex-col lg:min-h-0">
      <header className="mb-5 shrink-0">
        <Skeleton className="h-9 w-52 rounded-[3px]" />
        <Skeleton className="mt-2 h-4 w-[30rem] max-w-full rounded-[3px]" />
      </header>

      <section className="flex flex-1 flex-col rounded-[3px] border border-hairline lg:min-h-0">
        <div className="shrink-0 border-b border-hairline px-4 py-3.5">
          <Skeleton className="h-3 w-80 max-w-full rounded-[2px]" />
        </div>
        <div className="flex-1 px-3 pt-3 lg:min-h-0 lg:overflow-hidden">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="mb-3 h-10 w-full rounded-[2px]" style={{ opacity: 1 - i * 0.09 }} />
          ))}
        </div>
      </section>
    </div>
  );
}
