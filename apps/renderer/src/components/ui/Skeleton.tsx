import clsx from "clsx";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded bg-surface-3",
        className
      )}
      aria-hidden="true"
    />
  );
}

export function ServerCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4 flex flex-col gap-3">
      <div className="flex justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-7 w-14 rounded" />
        <Skeleton className="h-7 w-14 rounded" />
      </div>
    </div>
  );
}

export function ServerRowSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}
