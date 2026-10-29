import type { ReactNode } from "react";
import { RefreshButton } from "@/components/refresh-button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {/* Every page can fetch its data again: email imports arrive in the background. */}
      <div className="flex flex-wrap items-center gap-2">
        <RefreshButton />
        {action}
      </div>
    </div>
  );
}

/** A card with a title bar whose body sits flush, for lists and timelines. */
export function SectionCard({
  title,
  action,
  className,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("min-w-0 gap-0 overflow-hidden py-0", className)}>
      <div className="flex min-h-13 items-center justify-between gap-3 border-b px-5 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function DetailRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right font-medium break-words",
          mono && "font-mono text-xs",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
