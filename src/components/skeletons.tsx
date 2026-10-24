import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Loading placeholders shaped like the content they stand in for, so the page
// keeps its layout while signed-in data streams in.

export function ListCardSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)} aria-busy="true">
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function StatTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} className="gap-2 p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-12" />
        </Card>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-6 flex items-start gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}

export function FormCardSkeleton() {
  return (
    <Card className="gap-4 p-6" aria-busy="true">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </Card>
  );
}
