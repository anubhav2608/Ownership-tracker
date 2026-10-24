import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Empty state for a list that has no records yet, with a way to add the first one. */
export function EmptyCta({
  icon,
  title,
  description,
  href = "/add",
  action = "Add record",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild size="sm">
          <Link href={href}>{action}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
