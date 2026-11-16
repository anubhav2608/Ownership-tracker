import Link from "next/link";
import { ArrowRight, Banknote, Clock, ShoppingBag, TrendingUp, type LucideIcon } from "lucide-react";
import { SectionCard } from "@/components/layout-bits";
import type { Insight } from "@/lib/insights";
import { cn } from "@/lib/utils";

/** Each kind's icon and hue (oklch); anything needing attention turns amber. */
const KINDS: Record<Insight["kind"], { icon: LucideIcon; hue: number }> = {
  spend: { icon: TrendingUp, hue: 186 },
  biggest: { icon: ShoppingBag, hue: 255 },
  refund: { icon: Banknote, hue: 152 },
  deadline: { icon: Clock, hue: 70 },
};

/** A few sentences about the month so far; nothing at all when there's nothing to say. */
export function MonthInShort({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <SectionCard title="This month in short" className="mb-6">
      <ul className="divide-y">
        {insights.map((i) => {
          const { icon: Icon, hue } = KINDS[i.kind];
          const body = (
            <>
              <span
                className="hue-tile flex size-8 shrink-0 items-center justify-center rounded-lg"
                style={{ "--h": i.attention ? 70 : hue } as React.CSSProperties}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
              <span className={cn("min-w-0 flex-1", i.attention && "font-medium")}>{i.text}</span>
              {i.href && <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </>
          );
          return (
            <li key={i.text}>
              {i.href ? (
                <Link href={i.href} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-accent/60">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-5 py-3 text-sm">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
