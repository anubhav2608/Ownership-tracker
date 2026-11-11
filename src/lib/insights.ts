import { formatMoney, indianDay } from "@/lib/format";
import { amountSpent, type ReturnEntry } from "@/lib/refunds";
import type { Item, Order, ServiceEvent } from "@/lib/types";

// "This month in short": a few sentences the dashboard says about the month so
// far, worked out from what's saved. Each links to where the detail is.

export interface Insight {
  text: string;
  href?: string;
  /** Something to act on (money still to come, a deadline). */
  attention?: boolean;
}

const DAY = 864e5;
const month = (iso: string) => iso.slice(0, 7);
/** Whole days from one day to another, both read as days in India. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(indianDay(to)) - Date.parse(indianDay(from))) / DAY);

/** The months before this one, newest first (YYYY-MM). */
function previousMonths(today: string, count: number) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 2 - i, 1)).toISOString().slice(0, 7));
}

export function monthInsights({
  today,
  orders,
  events,
  items,
  returns,
}: {
  /** YYYY-MM-DD, in India. */
  today: string;
  orders: Order[];
  events: ServiceEvent[];
  items: Item[];
  returns: ReturnEntry[];
}): Insight[] {
  const out: Insight[] = [];
  const spentIn = (ym: string) =>
    orders.filter((o) => month(o.orderDate) === ym).reduce((s, o) => s + amountSpent(o), 0) +
    events.filter((e) => month(e.date) === ym).reduce((s, e) => s + e.totalCost, 0);

  // 1. This month so far, against the usual month (the last six that had any spending).
  const now = month(today);
  const thisMonth = spentIn(now);
  const before = previousMonths(today, 6).map(spentIn).filter((v) => v > 0);
  const usual = before.length ? before.reduce((s, v) => s + v, 0) / before.length : null;
  const bought = orders.filter((o) => month(o.orderDate) === now).length;
  const serviced = events.filter((e) => month(e.date) === now).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (bought + serviced > 0) {
    let text = `${formatMoney(thisMonth)} spent so far this month`;
    if (usual !== null && before.length >= 2) {
      const change = Math.round(((thisMonth - usual) / usual) * 100);
      text +=
        Math.abs(change) < 10
          ? `, about your usual month (${formatMoney(usual)}).`
          : `, ${Math.abs(change)}% ${change > 0 ? "more" : "less"} than your usual month (${formatMoney(usual)}).`;
    } else {
      // Too little history to compare with: say what it's made of.
      text += ` on ${[bought && plural(bought, "purchase"), serviced && plural(serviced, "service")].filter(Boolean).join(" and ")}.`;
    }
    out.push({ text, href: "/purchases" });
  } else if (usual !== null) {
    out.push({ text: `Nothing spent yet this month. Your usual month is ${formatMoney(usual)}.` });
  }

  // 2. The biggest purchase this month.
  const biggest = orders
    .filter((o) => month(o.orderDate) === now && amountSpent(o) > 0)
    .sort((a, b) => amountSpent(b) - amountSpent(a))[0];
  if (biggest) {
    const first = items.find((i) => i.orderId === biggest.id);
    const what = first ? `${first.name.replace(/(\.\.\.|…)$/, "")} from ${biggest.merchant}` : biggest.merchant;
    out.push({ text: `Biggest purchase: ${what}, ${formatMoney(amountSpent(biggest))}.`, href: `/purchases/${biggest.id}` });
  }

  // 3. Money still to come: items returned with no refund yet.
  const pending = returns.filter((r) => r.pending);
  if (pending.length) {
    const amount = pending.reduce((s, r) => s + r.items.reduce((t, i) => t + (i.price.value ?? 0), 0), 0);
    const oldest = pending.reduce((a, b) => (a.date < b.date ? a : b));
    const days = Math.max(0, daysBetween(oldest.date, today));
    out.push({
      text:
        pending.length === 1
          ? `${formatMoney(amount)} refund still to come from ${oldest.order.merchant}, ${days} day${days === 1 ? "" : "s"} since the return.`
          : `${formatMoney(amount)} in refunds still to come on ${pending.length} returns, the oldest ${days} day${days === 1 ? "" : "s"} ago.`,
      href: "/returns",
      attention: days >= 7,
    });
  } else {
    const back = returns.filter((r) => month(indianDay(r.date)) === now).reduce((s, r) => s + r.refunded, 0);
    if (back > 0) out.push({ text: `${formatMoney(back)} came back this month from returns and refunds.`, href: "/returns" });
  }

  // 4. Return windows closing in the next 7 days.
  const closing = items
    .filter((i) => i.status === "owned" && i.returnBy && i.returnBy >= today && daysBetween(today, i.returnBy) <= 7)
    .sort((a, b) => a.returnBy!.localeCompare(b.returnBy!));
  if (closing.length) {
    const first = closing[0];
    const days = daysBetween(today, first.returnBy!);
    const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    out.push({
      text:
        closing.length === 1
          ? `Last day to return ${first.name.replace(/(\.\.\.|…)$/, "")} is ${when}.`
          : `${closing.length} return windows close this week, the first ${when} (${first.name.replace(/(\.\.\.|…)$/, "")}).`,
      href: closing.length === 1 ? `/items/${first.id}` : "/items",
      attention: true,
    });
  }

  return out;
}
