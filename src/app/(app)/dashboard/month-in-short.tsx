import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/layout-bits";
import type { Insight } from "@/lib/insights";
import { cn } from "@/lib/utils";

/** A few sentences about the month so far; nothing at all when there's nothing to say. */
export function MonthInShort({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <SectionCard title="This month in short" className="mb-6">
      <ul className="divide-y">
        {insights.map((i) => {
          const body = (
            <>
              <span
                className={cn("mt-1.5 size-2 shrink-0 rounded-full", i.attention ? "bg-warning" : "bg-primary/40")}
                aria-hidden
              />
              <span className="min-w-0 flex-1">{i.text}</span>
              {i.href && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </>
          );
          return (
            <li key={i.text}>
              {i.href ? (
                <Link href={i.href} className="flex items-start gap-3 px-5 py-3 text-sm hover:bg-accent">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-5 py-3 text-sm">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
