"use client";

import { initialCartMutationResult } from "@/lib/actions/types";
import { CheckCircle2, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useT } from "@/i18n/provider";
import { calculateCartSavings, formatMoney } from "@/lib/money";
import type { Cart, CartItem } from "@/types/domain";
import { deleteActiveCartAction, finalizeCartAction } from "./actions";
import { MutationFeedback } from "./mutation-feedback";

export function CartSummary({ cart, items, checkoutKey }: { cart: Cart; items: CartItem[]; checkoutKey: string }) {
  const { t, locale } = useT();
  const [checkoutState, checkoutAction] = useActionState(finalizeCartAction, initialCartMutationResult);
  const [deleteState, deleteAction] = useActionState(deleteActiveCartAction, initialCartMutationResult);
  const [deleteMutationId] = useState(() => crypto.randomUUID());
  const savings = calculateCartSavings(items.map((item) => ({ savings: item.lineSavings })));
  return (
    <section className="border-t-2 border-[var(--ink)] bg-white p-4 sm:p-5">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase text-[var(--muted)]">{t("shopping.total")}</p>{savings !== "0.00" ? <p className="mt-1 text-sm font-semibold text-[var(--emerald-dark)]">{t("shopping.savings", { amount: formatMoney(savings, locale) })}</p> : null}</div><p className="text-3xl font-bold">{formatMoney(cart.total, locale)}</p></div>
      {cart.canManageCart ? <div className="mt-5 grid grid-cols-[44px_1fr] gap-2"><form action={deleteAction}><input type="hidden" name="cartId" value={cart.id} /><input type="hidden" name="mutationId" value={deleteMutationId} /><ConfirmButton type="submit" variant="secondary" size="icon" aria-label={t("shopping.deleteCart")} title={t("shopping.deleteCart")} confirmMessage={t("common.confirm")}><Trash2 className="h-5 w-5" aria-hidden /></ConfirmButton></form><form action={checkoutAction}><input type="hidden" name="cartId" value={cart.id} /><input type="hidden" name="checkoutKey" value={checkoutKey} /><input type="hidden" name="mutationId" value={checkoutKey} /><ConfirmButton type="submit" className="w-full" disabled={!cart.storeId || items.length === 0} confirmMessage={t("shopping.checkoutConfirm")}><CheckCircle2 className="h-5 w-5" aria-hidden />{t("shopping.checkout")}</ConfirmButton></form></div> : null}
      <div className="mt-3"><MutationFeedback result={checkoutState} /><MutationFeedback result={deleteState} /></div>
    </section>
  );
}
