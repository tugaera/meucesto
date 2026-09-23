"use client";

import { initialCartMutationResult } from "@/lib/actions/types";
import { Info, Plus, Search, Tag, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/i18n/provider";
import { parseLocalizedDecimal } from "@/lib/money";
import { enqueueCartAdd } from "@/lib/offline/queue";
import { barcodeLookupResponseSchema, type Cart, type ProductSummary, type ReferenceData } from "@/types/domain";
import { addCartItemAction, createProductAndAddAction } from "./actions";
import { DiscountFields } from "./discount-fields";
import { MutationFeedback } from "./mutation-feedback";
import { ProductTypeahead } from "./product-typeahead";
import { ScannerLauncher } from "./scanner-launcher";

type ProductDetailsValues = {
  name: string;
  barcode: string;
  productId: string;
  price: string;
  originalPrice: string;
  quantity: string;
  categoryId: string;
  subcategoryId: string;
  brandId: string;
  newBrandName: string;
  measurementQuantity: string;
  unitId: string;
  tags: string;
};

function localized(value: string, locale: "pt" | "en"): string {
  return locale === "pt" ? value.replace(".", ",") : value;
}

function ProductDetailsDialog({ open, onClose, cart, references, locale, values, onAdded }: {
  open: boolean; onClose: () => void; cart: Cart; references: ReferenceData; locale: "pt" | "en";
  values: ProductDetailsValues;
  onAdded: () => void;
}) {
  const { t } = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(values.productId ? addCartItemAction : createProductAndAddAction, initialCartMutationResult);
  const [mutationIds] = useState(() => ({ cart: crypto.randomUUID(), product: crypto.randomUUID(), brand: crypto.randomUUID() }));
  const [formValues, setFormValues] = useState(values);
  const [categoryId, setCategoryId] = useState(values.categoryId);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (state.success) {
      onAdded();
      dialogRef.current?.close();
    }
  }, [onAdded, state.success]);
  const existing = Boolean(values.productId);
  const update = <Key extends keyof ProductDetailsValues>(key: Key, value: ProductDetailsValues[Key]) => {
    setFormValues((current) => ({ ...current, [key]: value }));
  };
  return (
    <dialog ref={dialogRef} onClose={onClose} className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg border border-[var(--line)] bg-white p-0 text-[var(--ink)] backdrop:bg-black/50">
      <form action={action} className="flex max-h-[90vh] flex-col">
        <input type="hidden" name="cartId" value={cart.id} /><input type="hidden" name="revision" value={cart.revision} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="productId" value={formValues.productId} /><input type="hidden" name="mutationId" value={mutationIds.cart} /><input type="hidden" name="productMutationId" value={mutationIds.product} /><input type="hidden" name="brandMutationId" value={mutationIds.brand} />
        <header className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="font-bold">{t("shopping.productDetails")}</h2><p className="mt-1 text-xs text-[var(--muted)]">{existing ? t("shopping.localProduct") : t("shopping.unknownBarcode")}</p></div><Button type="button" variant="quiet" size="icon" aria-label={t("common.close")} onClick={() => dialogRef.current?.close()}><X className="h-5 w-5" aria-hidden /></Button></header>
        <div className="grid gap-4 overflow-y-auto p-5">
          <Field label={t("shopping.productName")} htmlFor="detail-name"><Input id="detail-name" name="name" value={formValues.name} onChange={(event) => update("name", event.target.value)} readOnly={existing} required /></Field>
          <Field label={t("shopping.barcode")} htmlFor="detail-barcode"><Input id="detail-barcode" name="barcode" value={formValues.barcode} onChange={(event) => update("barcode", event.target.value)} readOnly={existing} /></Field>
          <div className="grid gap-3">
            <DiscountFields idPrefix="detail" price={formValues.price} originalPrice={formValues.originalPrice} onPriceChange={(value) => update("price", value)} onOriginalPriceChange={(value) => update("originalPrice", value)} priceLabel={t("shopping.price")} required />
            <Field label={t("shopping.quantity")} htmlFor="detail-quantity"><Input id="detail-quantity" name="quantity" inputMode="decimal" value={formValues.quantity} onChange={(event) => update("quantity", event.target.value)} required /></Field>
          </div>
          {!existing ? <>
            <div className="grid grid-cols-2 gap-3"><Field label={t("products.category")} htmlFor="detail-category"><select id="detail-category" name="categoryId" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); update("categoryId", event.target.value); update("subcategoryId", ""); }} className="min-h-11 w-full border border-[var(--line)] bg-white px-3"><option value="">{t("common.none")}</option>{references.categories.filter((category) => category.isActive && !category.parentId).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></Field><Field label={t("products.subcategory")} htmlFor="detail-subcategory"><select id="detail-subcategory" name="subcategoryId" value={formValues.subcategoryId} onChange={(event) => update("subcategoryId", event.target.value)} className="min-h-11 w-full border border-[var(--line)] bg-white px-3"><option value="">{t("common.none")}</option>{references.categories.filter((category) => category.isActive && category.parentId === categoryId).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></Field></div>
            <Field label={t("products.brand")} htmlFor="detail-brand"><select id="detail-brand" name="brandId" value={formValues.brandId} onChange={(event) => update("brandId", event.target.value)} className="min-h-11 w-full border border-[var(--line)] bg-white px-3"><option value="">{t("common.none")}</option>{references.brands.filter((brand) => brand.isActive && brand.isVerified).map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></Field>
            <Field label={t("products.createBrand")} htmlFor="detail-new-brand"><Input id="detail-new-brand" name="newBrandName" value={formValues.newBrandName} onChange={(event) => update("newBrandName", event.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label={t("products.measurement")} htmlFor="detail-measurement"><Input id="detail-measurement" name="measurementQuantity" inputMode="decimal" value={formValues.measurementQuantity} onChange={(event) => update("measurementQuantity", event.target.value)} /></Field><Field label={t("products.unit")} htmlFor="detail-unit"><select id="detail-unit" name="unitId" value={formValues.unitId || references.units.find((unit) => unit.isDefault)?.id || ""} onChange={(event) => update("unitId", event.target.value)} className="min-h-11 w-full border border-[var(--line)] bg-white px-3"><option value="">{t("common.none")}</option>{references.units.filter((unit) => unit.isActive).map((unit) => <option value={unit.id} key={unit.id}>{unit.abbreviation}</option>)}</select></Field></div>
            <Field label={t("products.tags")} htmlFor="detail-tags"><div className="relative"><Tag className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden /><Input id="detail-tags" name="tags" className="pl-10" value={formValues.tags} onChange={(event) => update("tags", event.target.value)} placeholder={t("products.tagsHint")} /></div></Field>
          </> : null}
          <MutationFeedback result={state} />
        </div>
        <footer className="flex justify-end gap-3 border-t border-[var(--line)] px-5 py-4"><Button type="button" variant="secondary" onClick={() => dialogRef.current?.close()}>{t("common.cancel")}</Button><SubmitButton pendingLabel={t("common.loading")}><Plus className="h-4 w-4" aria-hidden />{t("shopping.addItem")}</SubmitButton></footer>
      </form>
    </dialog>
  );
}

export function AddItemForm({ cart, references, userId }: { cart: Cart; references: ReferenceData; userId: string }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(addCartItemAction, initialCartMutationResult);
  const [mutationId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [offlineFeedback, setOfflineFeedback] = useState<"queued" | "invalid" | null>(null);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "local" | "external" | "none" | "error">("idle");
  const [suggestion, setSuggestion] = useState({ categoryId: "", subcategoryId: "", brandId: "", newBrandName: "", measurementQuantity: "", unitId: "", tags: "" });
  const holdTimer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const choose = (product: ProductSummary) => { setName(product.name); setBarcode(product.barcode ?? ""); setProductId(product.id); if (product.latestPrice) { setPrice(localized(product.latestPrice.price, locale)); setOriginalPrice(product.latestPrice.originalPrice ? localized(String(product.latestPrice.originalPrice), locale) : ""); } };
  const startHold = () => { held.current = false; holdTimer.current = window.setTimeout(() => { held.current = true; setDetailsOpen(true); }, 450); };
  const clearHold = () => { if (holdTimer.current) window.clearTimeout(holdTimer.current); };
  const lookupBarcode = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    setLookupStatus("loading");
    try {
      const response = await fetch(`/api/products/barcode/${encodeURIComponent(value)}`, { cache: "no-store" });
      const result = barcodeLookupResponseSchema.safeParse(await response.json());
      if (!response.ok || !result.success) { setLookupStatus("error"); return; }
      if (result.data.source === "none") { setLookupStatus("none"); setProductId(""); return; }
      if (result.data.source === "local") { choose(result.data.product); setLookupStatus("local"); return; }
      const external = result.data.product;
      const brand = references.brands.find((item) => item.name.localeCompare(external.brandName ?? "", undefined, { sensitivity: "base" }) === 0);
      const unit = references.units.find((item) => item.abbreviation === external.unitAbbreviation);
      setName(external.name); setBarcode(external.barcode); setProductId("");
      setSuggestion({ categoryId: "", subcategoryId: "", brandId: brand?.id ?? "", newBrandName: brand ? "" : external.brandName ?? "", measurementQuantity: external.measurementQuantity ?? "", unitId: unit?.id ?? "", tags: external.tags.join(", ") });
      setLookupStatus("external"); setDetailsOpen(true);
    } catch { setLookupStatus("error"); }
  };
  const clearForm = () => {
    setName("");
    setBarcode("");
    setProductId("");
    setPrice("");
    setOriginalPrice("");
    setQuantity("1");
    setSuggestion({ categoryId: "", subcategoryId: "", brandId: "", newBrandName: "", measurementQuantity: "", unitId: "", tags: "" });
    setLookupStatus("idle");
  };
  const queueWhenOffline = (event: FormEvent<HTMLFormElement>) => {
    if (navigator.onLine) return;
    event.preventDefault();
    const canonicalPrice = parseLocalizedDecimal(price, locale, 2);
    const canonicalQuantity = parseLocalizedDecimal(quantity, locale, 3);
    const canonicalOriginal = originalPrice ? parseLocalizedDecimal(originalPrice, locale, 2) : null;
    if (!cart.storeId || !name.trim() || canonicalPrice === null || canonicalQuantity === null || (originalPrice && canonicalOriginal === null)) {
      setOfflineFeedback("invalid");
      return;
    }
    void enqueueCartAdd({ userId, cartId: cart.id, name: name.trim(), barcode: barcode.trim() || null, productId: productId || null, price: canonicalPrice, originalPrice: canonicalOriginal, quantity: canonicalQuantity }).then(() => {
      setOfflineFeedback("queued");
      setName(""); setBarcode(""); setProductId(""); setPrice(""); setOriginalPrice(""); setQuantity("1");
    });
  };
  return (
    <>
      <form action={action} onSubmit={queueWhenOffline} className="grid gap-4 border-t border-[var(--line)] p-4 sm:p-5">
        <input type="hidden" name="cartId" value={cart.id} /><input type="hidden" name="revision" value={cart.revision} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="productId" value={productId} /><input type="hidden" name="mutationId" value={mutationId} />
        <div className="flex gap-2"><div className="min-w-0 flex-1"><ProductTypeahead value={name} onChange={(value) => { setName(value); setProductId(""); }} onChoose={choose} /></div><ScannerLauncher onResult={(value) => { setBarcode(value); setProductId(""); void lookupBarcode(value); }} /></div>
        <Field label={t("shopping.barcode")} htmlFor="barcode"><Input id="barcode" name="barcode" value={barcode} onChange={(event) => { setBarcode(event.target.value); setProductId(""); }} inputMode="numeric" /></Field>
        <Button type="button" variant="secondary" onClick={() => void lookupBarcode(barcode)} disabled={!barcode.trim() || lookupStatus === "loading"}><Search className="h-4 w-4" aria-hidden />{t("products.lookupBarcode")}</Button>
        {lookupStatus !== "idle" ? <p role="status" aria-live="polite" className="text-xs text-[var(--muted)]">{lookupStatus === "loading" ? t("common.loading") : lookupStatus === "local" ? t("shopping.localProduct") : lookupStatus === "external" ? t("shopping.externalProduct") : lookupStatus === "none" ? t("products.lookupNone") : t("products.lookupError")}</p> : null}
        <DiscountFields idPrefix="cart-add" price={price} originalPrice={originalPrice} onPriceChange={setPrice} onOriginalPriceChange={setOriginalPrice} priceLabel={t("shopping.price")} required />
        <Field label={t("shopping.quantity")} htmlFor="quantity"><Input id="quantity" name="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" required /></Field>
        <MutationFeedback result={state} />
        {offlineFeedback ? <p role={offlineFeedback === "invalid" ? "alert" : "status"} className={offlineFeedback === "invalid" ? "text-sm font-semibold text-[var(--danger)]" : "text-sm font-semibold text-[var(--emerald-dark)]"}>{t(offlineFeedback === "invalid" ? "errors.VALIDATION_ERROR" : "offline.itemQueued")}</p> : null}
        <div className="grid grid-cols-[1fr_44px] gap-2"><Button type="submit" disabled={!cart.storeId} onPointerDown={startHold} onPointerUp={clearHold} onPointerCancel={clearHold} onContextMenu={(event) => event.preventDefault()} onClick={(event) => { if (held.current) { event.preventDefault(); held.current = false; } }}><Plus className="h-4 w-4" aria-hidden />{t("shopping.addItem")}</Button><Button type="button" variant="secondary" size="icon" title={t("shopping.productDetails")} aria-label={t("shopping.productDetails")} onClick={() => setDetailsOpen(true)}><Info className="h-5 w-5" aria-hidden /></Button></div>
        {!cart.storeId ? <p className="text-xs text-[var(--amber)]">{t("shopping.storeRequired")}</p> : <p className="text-xs text-[var(--muted)]">{t("shopping.holdHint")}</p>}
        <p className="text-[11px] leading-5 text-[var(--muted)]">{t("products.openFoodFactsCredit")}</p>
      </form>
      {detailsOpen ? <ProductDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} onAdded={() => { clearForm(); setDetailsOpen(false); }} cart={cart} references={references} locale={locale} values={{ name, barcode, productId, price, originalPrice, quantity, ...suggestion }} /> : null}
    </>
  );
}
