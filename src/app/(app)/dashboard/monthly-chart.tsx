"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

// Month-by-month spending as stacked columns: purchases, then services on top.
// Plain HTML (no chart library): one column per month, the whole column is the
// hover target, and a visually hidden table carries the same numbers.

export interface MonthTotals {
  /** YYYY-MM */
  month: string;
  purchases: number;
  services: number;
}

const SERIES = [
  // Theme colours (globals.css), as classes so the build keeps them.
  { key: "purchases", label: "Purchases", swatch: "bg-chart-purchases" },
  { key: "services", label: "Services", swatch: "bg-chart-services" },
] as const;

const short = (ym: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
const long = (ym: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

/** ₹1.2L, ₹45k, ₹800: axis labels short enough for a phone. */
function compact(n: number) {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${+(n / 1e3).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

/** A round top for the axis: 1, 2 or 5 times a power of ten, at or above the largest month. */
function niceMax(n: number) {
  if (n <= 0) return 1000;
  const step = 10 ** Math.floor(Math.log10(n));
  return ([1, 2, 5, 10].map((f) => f * step).find((v) => v >= n) ?? 10 * step);
}

export function MonthlyChart({ months }: { months: MonthTotals[] }) {
  const [active, setActive] = useState<string | null>(null);
  const top = niceMax(Math.max(...months.map((m) => m.purchases + m.services)));
  const pct = (v: number) => (v / top) * 100;
  const shown = months.find((m) => m.month === active);
  const anyServices = months.some((m) => m.services > 0);

  return (
    <figure className="min-w-0">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Last 12 months</span>
        {/* The legend: always there for two series; the swatch beside the label carries identity. */}
        <span className="flex gap-4 text-xs text-muted-foreground" aria-hidden>
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", s.swatch)} />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>

      <div className="relative mt-3 grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2" aria-hidden>
        {/* Axis labels and recessive gridlines at 0, half and the top. */}
        <div className="relative h-44 text-right text-[11px] text-muted-foreground tabular-nums">
          {[1, 0.5, 0].map((f) => (
            <span key={f} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - f) * 100}%` }}>
              {compact(top * f)}
            </span>
          ))}
        </div>
        <div className="relative h-44">
          {[1, 0.5, 0].map((f) => (
            <span
              key={f}
              className={f === 0 ? "absolute inset-x-0 border-t border-border" : "absolute inset-x-0 border-t border-dashed border-border/70"}
              style={{ top: `${(1 - f) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 grid grid-cols-12 gap-1 sm:gap-2">
            {months.map((m) => {
              const total = m.purchases + m.services;
              return (
                <div
                  key={m.month}
                  className="group relative flex h-full flex-col justify-end"
                  onMouseEnter={() => setActive(m.month)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive(active === m.month ? null : m.month)}
                >
                  {/* Wider than the mark: the whole column is the hover target. */}
                  <span className="absolute inset-x-[-2px] inset-y-0 rounded-md group-hover:bg-accent/60" />
                  <div className="relative mx-auto flex w-full max-w-7 flex-col justify-end" style={{ height: `${pct(total)}%` }}>
                    {m.services > 0 && (
                      <span
                        className="block w-full rounded-t-[4px] bg-chart-services"
                        style={{ height: `${(m.services / total) * 100}%`, minHeight: 2 }}
                      />
                    )}
                    {m.services > 0 && m.purchases > 0 && <span className="block h-[2px] w-full shrink-0" />}
                    {m.purchases > 0 && (
                      <span
                        className={cn("block w-full bg-chart-purchases", m.services === 0 && "rounded-t-[4px]")}
                        style={{ height: `${(m.purchases / total) * 100}%`, minHeight: 2 }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {shown && (
            <div
              className="pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
              style={{
                left: `clamp(5.5rem, ${((months.indexOf(shown) + 0.5) / months.length) * 100}%, calc(100% - 5.5rem))`,
                bottom: `calc(${Math.min(pct(shown.purchases + shown.services), 40)}% + 0.5rem)`,
              }}
            >
              <p className="font-medium text-popover-foreground">{long(shown.month)}</p>
              {SERIES.filter((s) => s.key === "purchases" || anyServices).map((s) => (
                <p key={s.key} className="mt-1 flex items-center justify-between gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-sm", s.swatch)} />
                    {s.label}
                  </span>
                  <span className="tabular-nums text-popover-foreground">{formatMoney(shown[s.key])}</span>
                </p>
              ))}
              <p className="mt-1 flex justify-between border-t pt-1 font-medium text-popover-foreground">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(shown.purchases + shown.services)}</span>
              </p>
            </div>
          )}
        </div>
        <span />
        <div className="grid grid-cols-12 gap-1 text-center text-[10px] text-muted-foreground sm:gap-2 sm:text-[11px]">
          {months.map((m, i) => (
            // Every month on wider screens; every other one on a phone, so labels never collide.
            <span key={m.month} className={i % 2 === 1 ? "invisible sm:visible" : undefined}>
              {short(m.month)}
            </span>
          ))}
        </div>
      </div>

      {/* The same numbers as a table, for screen readers (hidden by its wrapper: tables don't shrink to sr-only's 1px). */}
      <div className="sr-only">
      <table>
        <caption>Spending by month, last 12 months</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Purchases</th>
            <th scope="col">Services</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{long(m.month)}</th>
              <td>{formatMoney(m.purchases)}</td>
              <td>{formatMoney(m.services)}</td>
              <td>{formatMoney(m.purchases + m.services)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
