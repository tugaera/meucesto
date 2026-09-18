"use client";

import { AlertCircle, CloudUpload, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { calculateLineAmounts, formatMoney, parseLocalizedDecimal } from "@/lib/money";
import { enqueueCartDelete, enqueueCartUpdate, retryOfflineMutation, subscribeToOfflineItems } from "@/lib/offline/queue";
import type { OfflineCartItem } from "@/lib/offline/types";

function localized(value: string, locale: "pt" | "en"): string {
  return locale === "pt" ? value.replace(".", ",") : value;
}

function OfflineCartItemRow({ item, editable }: { item: OfflineCartItem; editable: boolean }) {
  const { t, locale } = useT();
  const [feedback, setFeedback] = useState<"queued" | "invalid" | "failed" | null>(null);
  const subtotal = calculateLineAmounts(item.price, item.quantity, item.originalPrice).subtotal;
  const hasConflict = item.lastErrorCode === "REVISION_CONFLICT";
  const statusKey = hasConflict ? "sync.conflict" : item.status === "failed" ? "sync.failed" : item.status === "syncing" ? "sync.syncing" : "sync.pending";
  const errorCandidate = `errors.${item.lastErrorCode}`;
  const errorMessage = item.lastErrorCode === "MUTATION_EXPIRED"
    ? t("offline.expired")
    : item.status === "failed" && errorCandidate in dictionaries.en
      ? t(errorCandidate as TranslationKey)
      : null;

  const queueUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const rawPrice = String(form.get("price") ?? "");
    const rawOriginalPrice = String(form.get("originalPrice") ?? "");
    const rawQuantity = String(form.get("quantity") ?? "");
    const price = parseLocalizedDecimal(rawPrice, locale, 2);
    const originalPrice = rawOriginalPrice ? parseLocalizedDecimal(rawOriginalPrice, locale, 2) : null;
    const quantity = parseLocalizedDecimal(rawQuantity, locale, 3);
    if (!name || price === null || quantity === null || (rawOriginalPrice && originalPrice === null)) {
      setFeedback("invalid");
      return;
    }
    void enqueueCartUpdate({ userId: item.userId, cartId: item.cartId, itemId: item.temporaryId, expectedItemRevision: 1, name, price, originalPrice, quantity })
      .then(() => setFeedback("queued"))
      .catch(() => setFeedback("failed"));
  };

  const queueDelete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void enqueueCartDelete({ userId: item.userId, cartId: item.cartId, itemId: item.temporaryId, expectedItemRevision: 1 })
      .then(() => setFeedback("queued"))
      .catch(() => setFeedback("failed"));
  };

  return (
    <li className="grid gap-3 border-b border-amber-200 px-4 py-3 last:border-0 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-white text-[var(--amber)]">
          {item.status === "failed" ? <AlertCircle className="h-4 w-4" aria-hidden /> : <CloudUpload className="h-4 w-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={item.isDeleted ? "truncate text-sm font-semibold line-through" : "truncate text-sm font-semibold"}>{item.name}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{localized(item.quantity, locale)} {"\u00d7"} {formatMoney(item.price, locale)}</p>
          {item.isDeleted ? <p className="mt-1 text-xs font-semibold text-[var(--danger)]">{t("offline.removalQueued")}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">{formatMoney(subtotal, locale)}</p>
          <Badge tone={item.status === "failed" ? "danger" : "warning"}>{t(statusKey)}</Badge>
        </div>
        {item.status === "failed" ? <Button size="icon" variant="quiet" onClick={() => void retryOfflineMutation(item.mutationId)} title={t("common.retry")} aria-label={t("common.retry")}><RotateCcw className="h-4 w-4" aria-hidden /></Button> : null}
      </div>
      {errorMessage ? <p role="alert" className="ml-12 text-xs font-semibold text-[var(--danger)]">{errorMessage}</p> : null}
      {editable && !item.isDeleted ? (
        <details className="ml-12">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--emerald-dark)]"><Pencil className="h-4 w-4" aria-hidden />{t("common.edit")}</summary>
          <div className="grid gap-3 border-l-2 border-amber-200 py-2 pl-4">
            <form onSubmit={queueUpdate} className="grid gap-3">
              <Input name="name" defaultValue={item.name} aria-label={t("shopping.productName")} required />
              <div className="grid grid-cols-2 gap-2">
                <Input name="price" defaultValue={localized(item.price, locale)} inputMode="decimal" aria-label={t("shopping.price")} required />
                <Input name="originalPrice" defaultValue={item.originalPrice ? localized(item.originalPrice, locale) : ""} inputMode="decimal" aria-label={t("shopping.originalPrice")} />
              </div>
              <Input name="quantity" defaultValue={localized(item.quantity, locale)} inputMode="decimal" aria-label={t("shopping.quantity")} required />
              <Button type="submit" className="justify-self-end">{t("common.save")}</Button>
            </form>
            <form onSubmit={queueDelete} className="justify-self-start">
              <ConfirmButton type="submit" variant="quiet" className="text-[var(--danger)]" confirmMessage={t("common.confirm")}><Trash2 className="h-4 w-4" aria-hidden />{t("common.remove")}</ConfirmButton>
            </form>
            {feedback ? <p role={feedback === "queued" ? "status" : "alert"} className={feedback === "queued" ? "text-sm font-semibold text-[var(--emerald-dark)]" : "text-sm font-semibold text-[var(--danger)]"}>{t(feedback === "queued" ? "offline.changeQueued" : feedback === "invalid" ? "errors.VALIDATION_ERROR" : "errors.UNKNOWN")}</p> : null}
          </div>
        </details>
      ) : null}
    </li>
  );
}

export function OfflineCartItems({ userId, cartId, editable }: { userId: string; cartId: string; editable: boolean }) {
  const { t } = useT();
  const [items, setItems] = useState<OfflineCartItem[]>([]);
  useEffect(() => subscribeToOfflineItems(userId, cartId, setItems), [cartId, userId]);
  if (!items.length) return null;
  return <ul aria-label={t("offline.pendingItems")} className="border-y border-dashed border-[var(--amber)] bg-[var(--amber-soft)]">{items.map((item) => <OfflineCartItemRow key={item.temporaryId} item={item} editable={editable} />)}</ul>;
}
