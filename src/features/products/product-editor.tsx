"use client";

import { initialProductMutationResult } from "@/lib/actions/types";
import { ExternalLink, ScanLine, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import { barcodeLookupResponseSchema, type ProductDetail, type ReferenceData } from "@/types/domain";
import { ScannerLauncher } from "@/features/shopping/scanner-launcher";
import {
  createCatalogProductAction, saveCatalogProductAction } from "./actions";
import { ProductMutationFeedback } from "./product-mutation-feedback";

interface EditorValues {
  name: string;
  barcode: string;
  categoryId: string;
  subcategoryId: string;
  brandId: string;
  newBrandName: string;
  measurementQuantity: string;
  unitId: string;
  tags: string;
  isActive: boolean;
}

function valuesForProduct(product: ProductDetail | null, references: ReferenceData): EditorValues {
  return {
    name: product?.name ?? "",
    barcode: product?.barcode ?? "",
    categoryId: product?.categoryId ?? "",
    subcategoryId: product?.subcategoryId ?? "",
    brandId: product?.brandId ?? "",
    newBrandName: "",
    measurementQuantity: product?.measurementQuantity ? String(product.measurementQuantity) : "",
    unitId: product?.unitId ?? references.units.find((unit) => unit.isDefault)?.id ?? "",
    tags: product?.tags.join(", ") ?? "",
    isActive: product?.isActive ?? true,
  };
}

export function ProductEditor({
  references,
  product = null,
  elevated,
  onClose,
  onSaved,
}: {
  references: ReferenceData;
  product?: ProductDetail | null;
  elevated: boolean;
  onClose?: () => void;
  onSaved?: () => void;
}) {
  const { t, locale } = useT();
  const [state, action] = useActionState(product ? saveCatalogProductAction : createCatalogProductAction, initialProductMutationResult);
  const [values, setValues] = useState(() => valuesForProduct(product, references));
  const productMutationId = useMutationId(state);
  const brandMutationId = useMutationId(state);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "local" | "external" | "none" | "error">("idle");
  const [existingProductId, setExistingProductId] = useState<string | null>(null);
  const rootCategories = references.categories.filter((category) => !category.parentId);
  const subcategories = references.categories.filter((category) => category.parentId === values.categoryId);

  const update = <Key extends keyof EditorValues>(key: Key, value: EditorValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const lookUp = useCallback(async (rawBarcode: string) => {
    const barcode = rawBarcode.trim();
    if (!barcode) return;
    setLookupStatus("loading");
    setExistingProductId(null);
    try {
      const response = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}`, { cache: "no-store" });
      const parsed = barcodeLookupResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) {
        setLookupStatus("error");
        return;
      }
      if (parsed.data.source === "none") {
        setLookupStatus("none");
        return;
      }
      if (parsed.data.source === "local") {
        setLookupStatus("local");
        setExistingProductId(parsed.data.product.id);
        return;
      }
      const suggestion = parsed.data.product;
      const brand = references.brands.find((item) => item.name.localeCompare(suggestion.brandName ?? "", undefined, { sensitivity: "base" }) === 0);
      const unit = references.units.find((item) => item.abbreviation === suggestion.unitAbbreviation);
      setValues((current) => ({
        ...current,
        name: suggestion.name,
        barcode: suggestion.barcode,
        brandId: brand?.id ?? "",
        newBrandName: brand ? "" : suggestion.brandName ?? "",
        measurementQuantity: suggestion.measurementQuantity ?? "",
        unitId: unit?.id ?? (suggestion.measurementQuantity ? "" : current.unitId),
        tags: suggestion.tags.join(", "),
      }));
      setLookupStatus("external");
    } catch {
      setLookupStatus("error");
    }
  }, [references.brands, references.units]);

  useEffect(() => {
    if (!state.success) return;
    onSaved?.();
    onClose?.();
  }, [onClose, onSaved, state.success]);

  const lookupMessage = lookupStatus === "local"
    ? t("shopping.localProduct")
    : lookupStatus === "external"
      ? `${t("shopping.externalProduct")}. ${t("products.reviewSuggestion")}`
      : lookupStatus === "none"
        ? t("products.lookupNone")
        : lookupStatus === "error"
          ? t("products.lookupError")
          : lookupStatus === "loading"
            ? t("common.loading")
            : "";

  return (
    <form action={action} className="grid gap-5">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="mutationId" value={productMutationId} />
      <input type="hidden" name="brandMutationId" value={brandMutationId} />
      <Field label={t("shopping.barcode")} htmlFor={`catalog-barcode-${product?.id ?? "new"}`}>
        <div className="flex gap-2">
          <Input
            id={`catalog-barcode-${product?.id ?? "new"}`}
            name="barcode"
            value={values.barcode}
            onChange={(event) => update("barcode", event.target.value)}
            inputMode="numeric"
          />
          {!product ? <ScannerLauncher onResult={(barcode) => { update("barcode", barcode); void lookUp(barcode); }} /> : null}
          {!product ? (
            <Button type="button" variant="secondary" size="icon" title={t("products.lookupBarcode")} aria-label={t("products.lookupBarcode")} onClick={() => void lookUp(values.barcode)}>
              {lookupStatus === "loading" ? <ScanLine className="h-5 w-5 animate-pulse" aria-hidden /> : <Search className="h-5 w-5" aria-hidden />}
            </Button>
          ) : null}
        </div>
      </Field>
      {lookupMessage ? (
        <div aria-live="polite" className="border-l-4 border-[var(--emerald)] bg-[var(--emerald-soft)] px-4 py-3 text-sm">
          <p>{lookupMessage}</p>
          {existingProductId ? <Link href={`/products?product=${existingProductId}`} className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--emerald-dark)]">{t("products.openExisting")}<ExternalLink className="h-4 w-4" aria-hidden /></Link> : null}
        </div>
      ) : null}
      <Field label={t("common.name")} htmlFor={`catalog-name-${product?.id ?? "new"}`}>
        <Input id={`catalog-name-${product?.id ?? "new"}`} name="name" value={values.name} onChange={(event) => update("name", event.target.value)} required maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("products.category")} htmlFor={`catalog-category-${product?.id ?? "new"}`}>
          <Select id={`catalog-category-${product?.id ?? "new"}`} name="categoryId" value={values.categoryId} onChange={(event) => setValues((current) => ({ ...current, categoryId: event.target.value, subcategoryId: "" }))}>
            <option value="">{t("common.none")}</option>
            {rootCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? "" : ` (${t("common.inactive")})`}</option>)}
          </Select>
        </Field>
        <Field label={t("products.subcategory")} htmlFor={`catalog-subcategory-${product?.id ?? "new"}`}>
          <Select id={`catalog-subcategory-${product?.id ?? "new"}`} name="subcategoryId" value={values.subcategoryId} onChange={(event) => update("subcategoryId", event.target.value)}>
            <option value="">{t("common.none")}</option>
            {subcategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? "" : ` (${t("common.inactive")})`}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("products.brand")} htmlFor={`catalog-brand-${product?.id ?? "new"}`}>
          <Select id={`catalog-brand-${product?.id ?? "new"}`} name="brandId" value={values.brandId} onChange={(event) => update("brandId", event.target.value)}>
            <option value="">{t("common.none")}</option>
            {references.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{brand.isVerified ? "" : ` (${t("products.awaitingBrand")})`}</option>)}
          </Select>
        </Field>
        {!product ? <Field label={elevated ? t("products.newBrand") : t("products.createBrand")} htmlFor="catalog-new-brand"><Input id="catalog-new-brand" name="newBrandName" value={values.newBrandName} onChange={(event) => update("newBrandName", event.target.value)} maxLength={120} /></Field> : <div />}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("products.measurement")} htmlFor={`catalog-measurement-${product?.id ?? "new"}`}>
          <Input id={`catalog-measurement-${product?.id ?? "new"}`} name="measurementQuantity" value={values.measurementQuantity} onChange={(event) => update("measurementQuantity", event.target.value)} inputMode="decimal" />
        </Field>
        <Field label={t("products.unit")} htmlFor={`catalog-unit-${product?.id ?? "new"}`}>
          <Select id={`catalog-unit-${product?.id ?? "new"}`} name="unitId" value={values.unitId} onChange={(event) => update("unitId", event.target.value)}>
            <option value="">{t("common.none")}</option>
            {references.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.abbreviation} · {unit.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t("products.tags")} htmlFor={`catalog-tags-${product?.id ?? "new"}`} hint={t("products.tagsHint")}>
        <Input id={`catalog-tags-${product?.id ?? "new"}`} name="tags" value={values.tags} onChange={(event) => update("tags", event.target.value)} maxLength={500} />
      </Field>
      {product && elevated ? (
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input type="checkbox" name="isActive" checked={values.isActive} onChange={(event) => update("isActive", event.target.checked)} className="h-5 w-5 accent-[var(--emerald)]" />
          {t("products.enabled")}
        </label>
      ) : null}
      <ProductMutationFeedback result={state} />
      <div className="flex flex-wrap justify-end gap-3">
        {onClose ? <Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button> : null}
        <SubmitButton disabled={Boolean(existingProductId)}>{product ? t("products.saveDetails") : t("products.add")}</SubmitButton>
      </div>
    </form>
  );
}

export function AddProductDialog({ references, elevated }: { references: ReferenceData; elevated: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);
  return (
    <>
      <Button ref={triggerRef} onClick={() => setOpen(true)}>{t("products.add")}</Button>
      <dialog ref={dialogRef} onClose={close} onCancel={() => setOpen(false)} aria-labelledby="add-product-title" className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-2xl border border-[var(--line)] bg-white p-0 text-[var(--ink)] backdrop:bg-black/55">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--line)] bg-white px-5 py-4">
          <h2 id="add-product-title" className="text-lg font-bold">{t("products.add")}</h2>
          <Button variant="quiet" size="icon" onClick={close} aria-label={t("common.close")}><X className="h-5 w-5" aria-hidden /></Button>
        </header>
        <div className="overflow-y-auto p-5"><ProductEditor references={references} elevated={elevated} onClose={close} onSaved={() => router.refresh()} /></div>
        <p className="border-t border-[var(--line)] px-5 py-3 text-xs leading-5 text-[var(--muted)]">{t("products.openFoodFactsCredit")}</p>
      </dialog>
    </>
  );
}
