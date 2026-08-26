import { Skeleton } from "@/components/ui/skeleton";

/**
 * Every console page is force-dynamic and reads Postgres, so without this Next held the old page on
 * screen for the whole round trip and then swapped. Next prerenders this shell, so a click paints in
 * under 100ms and the data streams in behind it. Deliberately generic: it promises a heading and
 * rows, which every page here has, and no stat tiles, which only two of them do.
 */
export default function ConsoleLoading() {
  return (
    <div className="page-enter">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />

      <div className="mt-12 space-y-3">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.09 }} />
        ))}
      </div>
    </div>
  );
}
