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
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("group flex min-h-12 items-center gap-3 border-l-2 px-4 text-sm font-semibold transition-colors md:min-h-11", active ? "border-[var(--emerald)] bg-[var(--emerald-soft)] text-[var(--emerald-dark)]" : "border-transparent text-[var(--muted)] hover:bg-gray-50 hover:text-[var(--ink)]")}><Icon className="h-5 w-5 shrink-0" aria-hidden /><span>{t(key)}</span></Link>;
      })}
    </nav>
  );
}
