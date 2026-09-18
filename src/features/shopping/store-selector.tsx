"use client";

import { initialCartMutationResult } from "@/lib/actions/types";
import { Store } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { useT } from "@/i18n/provider";
import { Select } from "@/components/ui/field";
import type { ReferenceData } from "@/types/domain";
import { setCartStoreAction } from "./actions";
import { MutationFeedback } from "./mutation-feedback";

export function StoreSelector({ cartId, revision, selectedStoreId, stores, disabled }: { cartId: string; revision: number; selectedStoreId: string | null; stores: ReferenceData["stores"]; disabled: boolean }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(setCartStoreAction, initialCartMutationResult);
  const [mutationId] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="grid gap-2">
      <input type="hidden" name="cartId" value={cartId} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="mutationId" value={mutationId} />
      <label htmlFor="cart-store" className="flex items-center gap-2 text-sm font-bold"><Store className="h-4 w-4 text-[var(--emerald)]" aria-hidden />{t("shopping.store")}</label>
      <Select id="cart-store" name="storeId" defaultValue={selectedStoreId ?? ""} disabled={disabled || pending} onChange={() => formRef.current?.requestSubmit()}>
        <option value="">{t("shopping.selectStore")}</option>
        {stores.filter((store) => store.isActive).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
      </Select>
      <MutationFeedback result={state} />
    </form>
  );
}
