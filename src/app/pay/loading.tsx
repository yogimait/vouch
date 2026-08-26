import { Skeleton } from "@/components/ui/skeleton";

/** The authorization page reads the order before it can render. Paint the frame, not a blank tab. */
export default function PayLoading() {
  return (
    <main className="atmosphere flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-lg space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </main>
  );
}
