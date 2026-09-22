"use client";

import { ArrowLeft, CalendarDays } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeading, Surface } from "@/components/ui/surface";
import { useT } from "@/i18n/provider";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { HistoryDetailData } from "./data";
import { EmptyReceiptImportDelete } from "./empty-receipt-import-delete";
import { ReceiptPanel } from "./receipt-panel";

export function HistoryDetail({ data, aiEnabled }: { data: HistoryDetailData; aiEnabled: boolean }) {
  const { t, locale } = useT();
  const date = new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "long", timeStyle: "short" }).format(new Date(data.cart.finalizedAt));
  const emptyReceiptImport = data.cart.isReceiptImport && data.items.length === 0 && Number(data.cart.total) === 0;

  return (
    <div className="grid gap-6">
      <Link href="/history" className={cn(buttonVariants({ variant: "quiet", size: "compact" }), "w-fit px-0")}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("common.back")}
      </Link>
      <PageHeading title={data.cart.store?.name ?? t("history.detail")} description={t("history.finalizedAt", { date })} />
      <div className={cn("grid items-start gap-5", emptyReceiptImport ? "xl:grid-cols-[minmax(0,0.72fr)_minmax(420px,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]")}>
        <Surface>
          <header className="grid grid-cols-2 gap-3 border-b border-[var(--line)] p-4 sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">{t("history.owner", { email: data.cart.ownerEmail })}</p>
              <p className="mt-2 flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4" aria-hidden />{date}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">{t("shopping.total")}</p>
              <p className="mt-1 text-2xl font-bold text-[var(--emerald-dark)]">{formatMoney(data.cart.total, locale)}</p>
            </div>
          </header>
          {data.items.length ? (
            <ol>
              {data.items.map((item) => (
                <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--line)] px-4 py-4 last:border-0 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.name}</p>
                      {item.originalPrice ? <Badge tone="success">{formatMoney(item.originalPrice, locale)}</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">{item.quantity} x {formatMoney(item.price, locale)}</p>
                    {item.addedByEmail ? <p className="mt-1 text-[11px] text-gray-500">{t("shopping.contributor", { email: item.addedByEmail })}</p> : null}
                  </div>
                  <p className="font-bold">{formatMoney(item.lineTotal, locale)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <p className="px-5 py-10 text-center text-sm leading-6 text-[var(--muted)]">{t(data.cart.isReceiptImport ? "history.importPending" : "history.empty")}</p>
              {emptyReceiptImport && data.cart.isOwner ? <EmptyReceiptImportDelete cartId={data.cart.id} /> : null}
            </>
          )}
        </Surface>
        <Surface className="p-4 sm:p-5">
          <ReceiptPanel
            key={data.receipts.map((receipt) => `${receipt.id}:${receipt.sortOrder}`).join("|")}
            cartId={data.cart.id}
            receipts={data.receipts}
            canManage={data.cart.canManageReceipts}
            aiEnabled={aiEnabled}
            isReceiptImport={data.cart.isReceiptImport}
            receiptImportCompleted={data.cart.isReceiptImport && data.items.length > 0}
          />
        </Surface>
      </div>
    </div>
  );
}
