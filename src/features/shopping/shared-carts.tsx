import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { translate, type Locale } from "@/i18n";

interface SharedCart { id: string; ownerEmail: string; storeName: string | null; total: string; revision: number }

export function SharedCarts({ carts, locale }: { carts: SharedCart[]; locale: Locale }) {
  if (!carts.length) return null;
  return <Surface><h2 className="flex min-h-12 items-center gap-2 border-b border-[var(--line)] px-4 text-sm font-bold"><Users className="h-4 w-4 text-[var(--coral)]" aria-hidden />{translate(locale, "shopping.sharedCarts")}</h2><ul className="divide-y divide-[var(--line)]">{carts.map((cart) => <li key={cart.id}><Link href={`/shopping?cart=${cart.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 hover:bg-gray-50"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{cart.storeName ?? translate(locale, "shopping.selectStore")}</span><span className="block truncate text-xs text-[var(--muted)]">{cart.ownerEmail}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden /></Link></li>)}</ul></Surface>;
}
