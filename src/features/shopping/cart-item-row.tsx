"use client";

import { initialCartMutationResult } from "@/lib/actions/types";
import Decimal from "decimal.js";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { formatMoney, parseLocalizedDecimal } from "@/lib/money";
import { enqueueCartDelete, enqueueCartUpdate } from "@/lib/offline/queue";
import { colorForUser } from "@/lib/user-colors";
import type { CartItem } from "@/types/domain";
import { deleteCartItemAction, updateCartItemAction } from "./actions";
import { MutationFeedback } from "./mutation-feedback";

function localized(value: string, locale: "pt" | "en"): string { return locale === "pt" ? value.replace(".", ",") : value; }

export function CartItemRow({ item, cartId, userId, editable }: { item: CartItem; cartId: string; userId: string; editable: boolean }) {
  const { t, locale } = useT();
  const [quantity, setQuantity] = useState(item.quantity);
  const [updateState, updateAction] = useActionState(updateCartItemAction, initialCartMutationResult);
  const [deleteState, deleteAction] = useActionState(deleteCartItemAction, initialCartMutationResult);
  const [updateMutationId] = useState(() => crypto.randomUUID());
  const [deleteMutationId] = useState(() => crypto.randomUUID());
  const [offlineFeedback, setOfflineFeedback] = useState<"queued" | "invalid" | "failed" | null>(null);
  const contributor = item.addedByEmail ?? "?";
  const contributorColor = colorForUser(item.addedBy ?? contributor);
  const adjust = (change: number) => setQuantity((current) => {
    try { return Decimal.max(new Decimal("0.001"), new Decimal(current).plus(change)).toDecimalPlaces(3).toString(); } catch { return "1"; }
  });
  const queueUpdateWhenOffline = (event: FormEvent<HTMLFormElement>) => {
    if (navigator.onLine) return;
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const rawPrice = String(form.get("price") ?? "");
    const rawOriginalPrice = String(form.get("originalPrice") ?? "");
    const rawQuantity = String(form.get("quantity") ?? "");
    const price = parseLocalizedDecimal(rawPrice, locale, 2);
    const originalPrice = rawOriginalPrice ? parseLocalizedDecimal(rawOriginalPrice, locale, 2) : null;
    const nextQuantity = parseLocalizedDecimal(rawQuantity, locale, 3);
    if (!name || price === null || nextQuantity === null || (rawOriginalPrice && originalPrice === null)) {
      setOfflineFeedback("invalid");
      return;
    }
    void enqueueCartUpdate({ userId, cartId, itemId: item.id, expectedItemRevision: item.revision, name, price, originalPrice, quantity: nextQuantity })
      .then(() => setOfflineFeedback("queued"))
      .catch(() => setOfflineFeedback("failed"));
  };
  const queueDeleteWhenOffline = (event: FormEvent<HTMLFormElement>) => {
    if (navigator.onLine) return;
    event.preventDefault();
    void enqueueCartDelete({ userId, cartId, itemId: item.id, expectedItemRevision: item.revision })
      .then(() => setOfflineFeedback("queued"))
      .catch(() => setOfflineFeedback("failed"));
  };
  return (
    <li className="grid gap-3 border-b border-[var(--line)] px-4 py-4 last:border-0 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span title={t("shopping.contributor", { email: contributor })} aria-label={t("shopping.contributor", { email: contributor })} style={{ backgroundColor: contributorColor }} className="flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold text-white">{contributor.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold leading-5">{item.name}</h3>{item.lineSavings !== "0.00" ? <Badge tone="success">-{formatMoney(item.lineSavings, locale)}</Badge> : null}</div><p className="mt-1 text-xs text-[var(--muted)]">{formatMoney(item.price, locale)} × {localized(item.quantity, locale)}</p>{item.barcode ? <p className="mt-1 font-mono text-[11px] text-gray-400">{item.barcode}</p> : null}</div>
        <p className="shrink-0 text-base font-bold">{formatMoney(item.lineSubtotal, locale)}</p>
      </div>
      {editable ? (
        <details className="ml-12">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--emerald-dark)]"><Pencil className="h-4 w-4" aria-hidden />{t("common.edit")}</summary>
          <div className="grid gap-3 border-l-2 border-[var(--emerald-soft)] py-2 pl-4">
            <form action={updateAction} onSubmit={queueUpdateWhenOffline} className="grid gap-3">
              <input type="hidden" name="cartId" value={cartId} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="itemRevision" value={item.revision} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="mutationId" value={updateMutationId ?? ""} />
              <Input name="name" defaultValue={item.name} aria-label={t("shopping.productName")} required />
              <div className="grid grid-cols-2 gap-2"><Input name="price" defaultValue={localized(item.price, locale)} inputMode="decimal" aria-label={t("shopping.price")} required /><Input name="originalPrice" defaultValue={item.originalPrice ? localized(item.originalPrice, locale) : ""} inputMode="decimal" aria-label={t("shopping.originalPrice")} /></div>
              <div className="flex gap-2"><Button type="button" size="icon" variant="secondary" onClick={() => adjust(-1)} aria-label="-1"><Minus className="h-4 w-4" aria-hidden /></Button><Input name="quantity" value={localized(quantity, locale)} onChange={(event) => setQuantity(event.target.value.replace(",", "."))} inputMode="decimal" aria-label={t("shopping.quantity")} className="text-center" required /><Button type="button" size="icon" variant="secondary" onClick={() => adjust(1)} aria-label="+1"><Plus className="h-4 w-4" aria-hidden /></Button></div>
              <Button type="submit" className="justify-self-end">{t("common.save")}</Button>
            </form>
            <form action={deleteAction} onSubmit={queueDeleteWhenOffline} className="justify-self-start"><input type="hidden" name="cartId" value={cartId} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="itemRevision" value={item.revision} /><input type="hidden" name="mutationId" value={deleteMutationId} /><ConfirmButton type="submit" variant="quiet" className="text-[var(--danger)]" confirmMessage={t("common.confirm")}><Trash2 className="h-4 w-4" aria-hidden />{t("common.remove")}</ConfirmButton></form>
            <MutationFeedback result={updateState} /><MutationFeedback result={deleteState} />
            {offlineFeedback ? <p role={offlineFeedback === "queued" ? "status" : "alert"} className={offlineFeedback === "queued" ? "text-sm font-semibold text-[var(--emerald-dark)]" : "text-sm font-semibold text-[var(--danger)]"}>{t(offlineFeedback === "queued" ? "offline.changeQueued" : offlineFeedback === "invalid" ? "errors.VALIDATION_ERROR" : "errors.UNKNOWN")}</p> : null}
          </div>
        </details>
      ) : null}
    </li>
  );
}
