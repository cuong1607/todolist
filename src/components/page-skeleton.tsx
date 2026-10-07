import { Skeleton } from "@/components/ui/skeleton";

/** Card-shaped placeholders, sized like the rows they stand in for. */
function Rows({ count, className = "h-16 rounded-xl" }: { count: number; className?: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Đang tải" data-slot="page-skeleton" className="space-y-6">
      {children}
    </div>
  );
}

/** Any list page while its data loads: heading, then rows. The shell stays on screen around it. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Frame>
      <Skeleton className="h-9 w-40 md:hidden" />
      <div className="space-y-2">
        <Rows count={rows} />
      </div>
    </Frame>
  );
}

/** Today: greeting, progress card, one section of task cards. */
export function TodaySkeleton() {
  return (
    <Frame>
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-44" />
      </div>
      <Skeleton className="h-[5.25rem] rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Rows count={4} />
      </div>
    </Frame>
  );
}

/** Admin dashboard: four summary tiles, then member cards. */
export function OverviewSkeleton() {
  return (
    <Frame>
      <Skeleton className="h-11 w-full max-w-md rounded-xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Rows count={4} className="h-24 rounded-2xl" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Rows count={4} className="h-36 rounded-2xl" />
      </div>
    </Frame>
  );
}
