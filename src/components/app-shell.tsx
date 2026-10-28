"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Inbox,
  LayoutDashboard,
  LogOut,
  Plus,
  Receipt,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";

/** Log out (a POST, so a link or prefetch can't sign anyone out); in the demo, back to the front page. */
function LogOutButton({ compact = false }: { compact?: boolean }) {
  const label = isSupabaseConfigured ? "Log out" : "Leave demo";
  const inner = compact ? <LogOut className="size-5" /> : <><LogOut /> {label}</>;
  const props = compact
    ? ({ variant: "ghost", size: "icon", "aria-label": label } as const)
    : ({ variant: "ghost", className: "w-full justify-start gap-3 px-2.5 text-muted-foreground" } as const);
  return isSupabaseConfigured ? (
    <form action="/auth/signout" method="post">
      <Button type="submit" {...props}>
        {inner}
      </Button>
    </form>
  ) : (
    <Button asChild {...props}>
      <Link href="/">{inner}</Link>
    </Button>
  );
}

const nav: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/items", label: "Items", icon: Boxes },
  { href: "/purchases", label: "Purchases", icon: Receipt },
  { href: "/imports", label: "Imports", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
        O
      </span>
      Ownership
    </Link>
  );
}

export function AppShell({
  inboxBadge,
  inboxDot,
  children,
}: {
  inboxBadge: ReactNode;
  inboxDot: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card px-3 py-5 md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <Button asChild className="mt-6">
          <Link href="/add">
            <Plus /> Add record
          </Link>
        </Button>
        <nav className="mt-6 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                isActive(href)
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
              {href === "/imports" && inboxBadge}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t pt-3">
          <LogOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <Button asChild size="icon" aria-label="Add record">
              <Link href="/add">
                <Plus className="size-5" />
              </Link>
            </Button>
            <LogOutButton compact />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-8">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2.5 text-[11px]",
                isActive(href) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
              {href === "/imports" && inboxDot}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
