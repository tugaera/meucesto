"use client";

import { initialListMutationResult } from "@/lib/actions/types";
import { Plus, Search } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import { barcodeLookupResponseSchema, type ProductSummary } from "@/types/domain";
import { ProductTypeahead } from "@/features/shopping/product-typeahead";
import { ScannerLauncher } from "@/features/shopping/scanner-launcher";
import { addListItemAction } from "./actions";
import { ListMutationFeedback } from "./mutation-feedback";
import type { ListMutationResult } from "./actions";

export function ListAddItem({ listId, revision }: { listId: string; revision: number }) {
  const { locale } = useT();
  const [state, action] = useActionState(addListItemAction, initialListMutationResult);
  const mutationId = useMutationId(state);
  return <ListAddItemFields key={mutationId} listId={listId} revision={revision} locale={locale} mutationId={mutationId} action={action} state={state} />;
}

function ListAddItemFields({
  listId,
  revision,
  locale,
  mutationId,
  action,
  state,
}: {
  listId: string;
  revision: number;
  locale: "pt" | "en";
  mutationId: string;
  action: (formData: FormData) => void;
  state: ListMutationResult;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "local" | "external" | "none" | "error">("idle");

  const choose = (product: ProductSummary) => { setName(product.name); setBarcode(product.barcode ?? ""); setProductId(product.id); };

  const lookupBarcode = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    setLookupStatus("loading");
    try {
      const response = await fetch(`/api/products/barcode/${encodeURIComponent(value)}`, { cache: "no-store" });
      const result = barcodeLookupResponseSchema.safeParse(await response.json());
      if (!response.ok || !result.success) {
        setLookupStatus("error");
        return;
      }
      if (result.data.source === "none") {
        setBarcode(value);
        setProductId("");
        setLookupStatus("none");
        return;
      }
      if (result.data.source === "local") {
        choose(result.data.product);
        setLookupStatus("local");
        return;
      }
      setName(result.data.product.name);
      setBarcode(result.data.product.barcode);
      setProductId("");
      setLookupStatus("external");
    } catch {
      setLookupStatus("error");
    }
  };

  const lookupMessage = lookupStatus === "loading"
    ? t("common.loading")
    : lookupStatus === "local"
      ? t("shopping.localProduct")
      : lookupStatus === "external"
        ? t("shopping.externalProduct")
        : lookupStatus === "none"
          ? t("products.lookupNone")
          : lookupStatus === "error"
            ? t("products.lookupError")
            : "";

  return (
    <form action={action} className="grid gap-4 p-4 sm:p-5">
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="mutationId" value={mutationId} />
      <ProductTypeahead value={name} onChange={(value) => { setName(value); setProductId(""); }} onChoose={choose} />
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
        <Field label={t("shopping.barcode")} htmlFor="list-barcode">
          <div className="flex gap-2">
            <Input id="list-barcode" name="barcode" value={barcode} onChange={(event) => { setBarcode(event.target.value); setProductId(""); }} inputMode="numeric" />
            <ScannerLauncher onResult={(value) => { setBarcode(value); setProductId(""); void lookupBarcode(value); }} />
            <Button type="button" variant="secondary" size="icon" title={t("products.lookupBarcode")} aria-label={t("products.lookupBarcode")} onClick={() => void lookupBarcode(barcode)} disabled={!barcode.trim() || lookupStatus === "loading"}>
              <Search className={lookupStatus === "loading" ? "h-5 w-5 animate-pulse" : "h-5 w-5"} aria-hidden />
            </Button>
          </div>
        </Field>
        <Field label={t("lists.plannedQuantity")} htmlFor="list-quantity">
          <Input id="list-quantity" name="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" required />
        </Field>
      </div>
      {lookupMessage ? <p role="status" aria-live="polite" className="text-xs text-[var(--muted)]">{lookupMessage}</p> : null}
      <SubmitButton pendingLabel={t("common.loading")}><Plus className="h-4 w-4" aria-hidden />{t("lists.addItem")}</SubmitButton>
      <ListMutationFeedback result={state} />
    </form>
  );
}
