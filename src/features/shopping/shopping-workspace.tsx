"use client";

import { initialCartMutationResult } from "@/lib/actions/types";
import { Link2, ShoppingBasket } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeading, Surface } from "@/components/ui/surface";
import { useT } from "@/i18n/provider";
import { RealtimeController } from "@/lib/realtime/controller";
import type { ShoppingData } from "./data";
import { AddItemForm } from "./add-item-form";
import { CartItemRow } from "./cart-item-row";
import { CartSummary } from "./cart-summary";
import { OfflineCartItems } from "./offline-cart-items";
import { SharePanel } from "./share-panel";
import { SharedCarts } from "./shared-carts";
import { StoreSelector } from "./store-selector";
import { TrackingPanel } from "./tracking-panel";
import { attachTrackingListAction, leaveSharedCartAction } from "./actions";
import { MutationFeedback } from "./mutation-feedback";

function TrackingListConfirmation({ cartId, revision, listId, name }: { cartId: string; revision: number; listId: string; name: string }) {
  const { t } = useT();
  const [state, action] = useActionState(attachTrackingListAction, initialCartMutationResult);
  const [mutationId] = useState(() => crypto.randomUUID());
  return <div className="border-l-4 border-[var(--emerald)] bg-[var(--emerald-soft)] px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" aria-hidden />{t("shopping.attachListConfirm", { name })}</p><form action={action}><input type="hidden" name="cartId" value={cartId} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="listId" value={listId} /><input type="hidden" name="mutationId" value={mutationId} /><Button type="submit">{t("common.confirm")}</Button></form></div><MutationFeedback result={state} /></div>;
}

function SharedCartNotice({ cartId, ownerEmail }: { cartId: string; ownerEmail: string }) {
  const { t } = useT();
  const [state, action] = useActionState(leaveSharedCartAction, initialCartMutationResult);
  const [mutationId] = useState(() => crypto.randomUUID());
  return <div className="border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold">{t("shopping.sharedBy", { email: ownerEmail })}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("shopping.memberLimit")}</p></div><form action={action}><input type="hidden" name="cartId" value={cartId} /><input type="hidden" name="mutationId" value={mutationId} /><Button type="submit" variant="quiet" className="text-[var(--danger)]" onClick={(event) => { if (!window.confirm(t("common.confirm"))) event.preventDefault(); }}>{t("shopping.leave")}</Button></form></div><MutationFeedback result={state} /></div>;
}

export function ShoppingWorkspace({ data }: { data: ShoppingData }) {
  const { t, locale } = useT();
  const { cart, items, references } = data;
  return (
    <div className="grid gap-6">
      <RealtimeController resourceType="cart" resourceId={cart.id} revision={cart.revision} />
      <PageHeading title={t("shopping.title")} description={t("shopping.subtitle")} />
      {data.requestedTrackingList ? <TrackingListConfirmation cartId={cart.id} revision={cart.revision} listId={data.requestedTrackingList.id} name={data.requestedTrackingList.name} /> : null}
      {cart.isShared ? <SharedCartNotice cartId={cart.id} ownerEmail={cart.ownerEmail ?? ""} /> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,32rem)_minmax(260px,1fr)]">
        <Surface className="overflow-visible"><div className="p-4 sm:p-5"><StoreSelector key={cart.revision} cartId={cart.id} revision={cart.revision} selectedStoreId={cart.storeId} stores={references.stores} disabled={!cart.canManageCart} /></div>{items.length ? <ul>{items.map((item) => <CartItemRow key={`${item.id}:${item.revision}`} item={item} cartId={cart.id} userId={data.userId} editable={cart.canEditItems} />)}</ul> : <EmptyState icon={<ShoppingBasket className="h-5 w-5" aria-hidden />} title={t("shopping.empty")} />}<OfflineCartItems userId={data.userId} cartId={cart.id} editable={cart.canEditItems} />{cart.canEditItems ? <AddItemForm key={cart.revision} cart={cart} references={references} userId={data.userId} /> : null}<CartSummary key={cart.revision} cart={cart} items={items} checkoutKey={data.checkoutKey} /></Surface>
        <aside className="grid gap-4"><TrackingPanel key={`${cart.id}:${data.tracking?.revision ?? cart.revision}`} cartId={cart.id} cartRevision={cart.revision} lists={data.lists} cartItems={items} tracking={data.tracking} />{cart.isOwner ? <SharePanel key={cart.revision} cartId={cart.id} members={data.members} /> : null}<SharedCarts carts={data.sharedCarts} locale={locale} /></aside>
      </div>
    </div>
  );
}
