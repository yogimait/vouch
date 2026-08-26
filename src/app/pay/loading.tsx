import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the page it stands in for: a heading, four stacked cards, then the authorisation
 * block. A generic centred panel promised a layout this route no longer has, so the swap to real
 * content moved everything on screen.
 */
export default function PayLoading() {
  return (
    <main className="atmosphere min-h-dvh px-5 py-12 sm:px-8">
      <div className="page-enter mx-auto w-full max-w-[40rem]">
        <header className="mb-6">
          <Skeleton className="h-3 w-44 rounded-[2px]" />
          <Skeleton className="mt-3 h-9 w-[22rem] max-w-full rounded-[3px]" />
          <Skeleton className="mt-3 h-4 w-full max-w-[28rem] rounded-[3px]" />
        </header>

        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[3px] border border-hairline p-4" style={{ opacity: 1 - i * 0.14 }}>
              <Skeleton className="h-3 w-40 rounded-[2px]" />
              <Skeleton className="mt-3 h-10 w-44 rounded-[3px]" />
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
                {[0, 1, 2, 3].map((f) => (
                  <div key={f}>
                    <Skeleton className="h-2.5 w-20 rounded-[2px]" />
                    <Skeleton className="mt-1.5 h-4 w-32 rounded-[2px]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-[3px] border border-hairline p-4">
          <Skeleton className="h-4 w-72 max-w-full rounded-[2px]" />
        </div>
      </div>
    </main>
  );
}
