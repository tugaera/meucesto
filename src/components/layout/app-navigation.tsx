"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, ListChecks, PackageSearch, Settings, Shield, ShoppingBasket } from "lucide-react";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const primaryItems = [
  { href: "/shopping", key: "nav.shopping", icon: ShoppingBasket },
  { href: "/lists", key: "nav.lists", icon: ListChecks },
  { href: "/products", key: "nav.products", icon: PackageSearch },
  { href: "/history", key: "nav.history", icon: History },
  { href: "/profile", key: "nav.profile", icon: Settings },
] as const;

export function AppNavigation({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();
  const { t } = useT();
  const items = showAdmin ? [...primaryItems, { href: "/admin", key: "nav.admin" as const, icon: Shield }] : primaryItems;
  return (
    <nav aria-label={t("nav.main")} className="contents">
      {items.map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-label={t(key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-12 items-center justify-center gap-1.5 border-t-2 px-1 text-xs font-semibold transition-colors md:min-h-11 md:justify-start md:gap-3 md:border-l-2 md:border-t-0 md:px-4 md:text-sm",
              active ? "border-[var(--emerald)] bg-[var(--emerald-soft)] text-[var(--emerald-dark)]" : "border-transparent text-[var(--muted)] hover:bg-gray-50 hover:text-[var(--ink)]",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className={cn("max-w-[4.75rem] truncate leading-4 md:max-w-none", active ? "inline" : "hidden md:inline")}>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
