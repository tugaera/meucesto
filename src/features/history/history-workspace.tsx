"use client";

import { CalendarDays, ChevronRight, History } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeading, Surface } from "@/components/ui/surface";
import { useT } from "@/i18n/provider";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { HistoryPageData } from "./data";

export function HistoryWorkspace({ data }: { data: HistoryPageData }) {
  const { t, locale } = useT();
  const formatter = new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="grid gap-6">
      <PageHeading title={t("history.title")} description={t("history.subtitle")} />
      <Surface>
        {data.rows.length ? <ol>{data.rows.map((row) => (
          <li key={row.id} className="border-b border-[var(--line)] last:border-0">
            <Link href={`/history/${row.id}`} className="grid min-h-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 hover:bg-gray-50 sm:px-5">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{row.store?.name ?? t("common.none")}</p>{row.isShared ? <Badge tone="info">{t("lists.shared")}</Badge> : null}</div><p className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{formatter.format(new Date(row.finalizedAt))}</p><p className="mt-1 text-xs text-[var(--muted)]">{t("history.owner", { email: row.ownerEmail })} · {t("history.itemCount", { count: row.itemCount })}</p></div>
              <div className="flex items-center gap-3"><span className="font-bold text-[var(--emerald-dark)]">{formatMoney(row.total, locale)}</span><ChevronRight className="h-5 w-5 text-[var(--muted)]" aria-hidden /></div>
            </Link>
          </li>
        ))}</ol> : <EmptyState icon={<History className="h-5 w-5" aria-hidden />} title={t("history.empty")} />}
      </Surface>
      {data.nextCursor ? <Link className={cn(buttonVariants({ variant: "secondary" }), "justify-self-center")} href={`/history?cursorAt=${encodeURIComponent(data.nextCursor.finalizedAt)}&cursorId=${data.nextCursor.id}`}>{t("history.nextPage")}</Link> : null}
    </div>
  );
}
