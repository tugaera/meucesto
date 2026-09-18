"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import type { ProductSummary } from "@/types/domain";
import { ProductTypeahead } from "@/features/shopping/product-typeahead";
import { addListItemAction, initialListMutationResult } from "./actions";
import { ListMutationFeedback } from "./mutation-feedback";

export function ListAddItem({ listId, revision }: { listId: string; revision: number }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(addListItemAction, initialListMutationResult);
  const [mutationId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(""); const [barcode, setBarcode] = useState(""); const [productId, setProductId] = useState("");
  const choose = (product: ProductSummary) => { setName(product.name); setBarcode(product.barcode ?? ""); setProductId(product.id); };
  return <form action={action} className="grid gap-4 p-4 sm:p-5"><input type="hidden" name="listId" value={listId} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="productId" value={productId} /><input type="hidden" name="mutationId" value={mutationId} /><ProductTypeahead value={name} onChange={(value) => { setName(value); setProductId(""); }} onChoose={choose} /><div className="grid grid-cols-[1fr_110px] gap-3"><Field label={t("shopping.barcode")} htmlFor="list-barcode"><Input id="list-barcode" name="barcode" value={barcode} onChange={(event) => { setBarcode(event.target.value); setProductId(""); }} inputMode="numeric" /></Field><Field label={t("lists.plannedQuantity")} htmlFor="list-quantity"><Input id="list-quantity" name="quantity" defaultValue="1" inputMode="decimal" required /></Field></div><Button type="submit"><Plus className="h-4 w-4" aria-hidden />{t("lists.addItem")}</Button><ListMutationFeedback result={state} /></form>;
}
