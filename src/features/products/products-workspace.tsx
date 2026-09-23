"use client";

import { initialProductMutationResult } from "@/lib/actions/types";
import Decimal from "decimal.js";
import { Barcode, CalendarDays, History, LoaderCircle, PackageOpen, Search, Store, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, PageHeading, Surface } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import { formatMoney } from "@/lib/money";
import { DiscountFields } from "@/features/shopping/discount-fields";
import { productSummariesSchema, type PriceHistoryEntry, type ProductSummary } from "@/types/domain";
import type { ProductCursor, ProductsData } from "./data";
import { deletePriceEntryAction, deleteProductAction, savePriceEntryAction } from "./actions";
import { AddProductDialog, ProductEditor } from "./product-editor";
import { ProductMutationFeedback } from "./product-mutation-feedback";

function ProductRow({ product, query }: { product: ProductSummary; query: string }) {
  const { t, locale } = useT();
  const href = `/products?${new URLSearchParams({ ...(query ? { q: query } : {}), product: product.id }).toString()}`;
  let perUnit: string | null = null;
  if (product.latestPrice && product.measurementQuantity && product.unit) {
    const baseFactor = product.unit.baseUnitFactor ? new Decimal(product.unit.baseUnitFactor) : new Decimal(1);
    const baseQuantity = new Decimal(String(product.measurementQuantity)).div(baseFactor);
    if (baseQuantity.gt(0)) {
      const amount = new Decimal(product.latestPrice.price).div(baseQuantity);
      perUnit = t("products.pricePerUnit", { price: formatMoney(amount.toDecimalPlaces(2), locale), unit: product.unit.baseUnitAbbreviation ?? product.unit.abbreviation });
    }
  }
  return (
    <li className="border-b border-[var(--line)] last:border-0">
      <Link href={href} className="grid min-h-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 hover:bg-gray-50 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words font-semibold">{product.name}</h2>
            {!product.isActive ? <Badge tone="danger">{t("common.inactive")}</Badge> : null}
            {product.brand && !product.brand.isVerified ? <Badge tone="warning">{t("products.awaitingBrand")}</Badge> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {[product.brand?.name, product.category?.name, product.subcategory?.name].filter(Boolean).join(" · ") || t("products.noPrice")}
          </p>
          {product.barcode ? <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-gray-500"><Barcode className="h-3.5 w-3.5" aria-hidden />{product.barcode}</p> : null}
        </div>
        <div className="max-w-36 text-right">
          {product.latestPrice ? <><p className="font-bold text-[var(--emerald-dark)]">{formatMoney(product.latestPrice.price, locale)}</p>{product.latestPrice.originalPrice ? <p className="text-xs text-[var(--muted)] line-through">{formatMoney(product.latestPrice.originalPrice, locale)}</p> : null}<p className="mt-1 text-xs text-[var(--muted)]">{product.latestPrice.storeName}</p>{perUnit ? <p className="mt-1 text-[11px] text-[var(--muted)]">{perUnit}</p> : null}</> : <span className="text-xs text-[var(--muted)]">{t("products.noPrice")}</span>}
        </div>
      </Link>
    </li>
  );
}

function PriceEntryForm({ data, productId, entry }: { data: ProductsData; productId: string; entry?: PriceHistoryEntry }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(savePriceEntryAction, initialProductMutationResult);
  const mutationId = useMutationId(state);
  const [price, setPrice] = useState(entry?.price ?? "");
  const [originalPrice, setOriginalPrice] = useState(entry?.originalPrice ? String(entry.originalPrice) : "");
  return (
    <form action={action} className="grid gap-4 border-t border-[var(--line)] pt-5">
      <h3 className="font-bold">{entry ? t("products.editPrice") : t("products.addPrice")}</h3>
      <input type="hidden" name="productId" value={productId} />
      {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="mutationId" value={mutationId} />
      <Field label={t("shopping.store")} htmlFor={`product-price-store-${entry?.id ?? "new"}`}>
        <Select id={`product-price-store-${entry?.id ?? "new"}`} name="storeId" required defaultValue={entry?.storeId ?? ""}>
          <option value="" disabled>{t("shopping.selectStore")}</option>
          {data.references.stores.map((store) => <option key={store.id} value={store.id}>{store.name}{store.isActive ? "" : ` (${t("common.inactive")})`}</option>)}
        </Select>
      </Field>
      <DiscountFields idPrefix={`product-price-${entry?.id ?? "new"}`} price={price} originalPrice={originalPrice} onPriceChange={setPrice} onOriginalPriceChange={setOriginalPrice} priceLabel={t("products.price")} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("shopping.quantity")} htmlFor={`product-price-quantity-${entry?.id ?? "new"}`}><Input id={`product-price-quantity-${entry?.id ?? "new"}`} name="quantity" inputMode="decimal" defaultValue={entry?.quantity ?? "1"} required /></Field>
        <Field label={t("products.effectiveAt")} htmlFor={`product-price-date-${entry?.id ?? "new"}`}><Input id={`product-price-date-${entry?.id ?? "new"}`} name="effectiveAt" type="datetime-local" defaultValue={entry ? new Date(entry.createdAt).toISOString().slice(0, 16) : ""} /></Field>
      </div>
      <ProductMutationFeedback result={state} />
      <SubmitButton>{entry ? t("common.save") : t("products.addPrice")}</SubmitButton>
    </form>
  );
}

function ProductDetailPanel({ data, elevated, isAdmin }: { data: ProductsData; elevated: boolean; isAdmin: boolean }) {
  const { t, locale } = useT();
  const product = data.selected;
  if (!product) return <EmptyState icon={<PackageOpen className="h-5 w-5" aria-hidden />} title={t("products.noSelection")} />;
  return <ProductDetailContent data={data} elevated={elevated} isAdmin={isAdmin} product={product} locale={locale} />;
}

function ProductDetailContent({ data, elevated, isAdmin, product, locale }: { data: ProductsData; elevated: boolean; isAdmin: boolean; product: NonNullable<ProductsData["selected"]>; locale: "pt" | "en" }) {
  const { t } = useT();
  const [mutationIds] = useState(() => ({
    product: crypto.randomUUID(),
    prices: Object.fromEntries(data.history.map((entry) => [entry.id, crypto.randomUUID()])),
  }));
  return (
    <div className="grid gap-6 p-4 sm:p-5">
      <header>
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{product.name}</h2><Badge tone={product.isActive ? "success" : "danger"}>{product.isActive ? t("common.active") : t("common.inactive")}</Badge></div>
        {product.barcode ? <p className="mt-2 flex items-center gap-2 font-mono text-xs text-[var(--muted)]"><Barcode className="h-4 w-4" aria-hidden />{product.barcode}</p> : null}
        <p className="mt-2 text-sm text-[var(--muted)]">{[product.brandName, product.categoryName, product.subcategoryName].filter(Boolean).join(" · ")}</p>
        {product.measurementQuantity && product.unitAbbreviation ? <p className="mt-2 text-sm font-semibold">{t("products.package", { quantity: String(product.measurementQuantity), unit: product.unitAbbreviation })}</p> : null}
        {product.tags.length ? <div className="mt-3 flex flex-wrap gap-2">{product.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div> : null}
      </header>
      {elevated ? <details><summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-[var(--emerald-dark)]">{t("common.edit")}</summary><div className="pt-4"><ProductEditor references={data.references} product={product} elevated /></div></details> : null}
      {isAdmin ? <form action={deleteProductAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="mutationId" value={mutationIds.product} /><ConfirmButton type="submit" variant="quiet" className="text-[var(--danger)]" confirmMessage={t("common.confirm")}><Trash2 className="h-4 w-4" aria-hidden />{t("products.hardDelete")}</ConfirmButton></form> : null}
      <section aria-labelledby="price-history-heading" className="border-t border-[var(--line)] pt-5">
        <h3 id="price-history-heading" className="flex items-center gap-2 font-bold"><History className="h-4 w-4" aria-hidden />{t("products.priceHistory")}</h3>
        {data.history.length ? (
          <ol className="mt-3 divide-y divide-[var(--line)]">
            {data.history.map((entry) => (
              <li key={entry.id} className="grid gap-3 py-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold"><Store className="h-4 w-4 shrink-0" aria-hidden />{entry.storeName}</p><p className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</p></div>
                <div className="flex items-center gap-2"><div className="text-right"><p className="font-bold">{formatMoney(entry.price, locale)}</p>{entry.originalPrice ? <p className="text-xs text-[var(--muted)] line-through">{formatMoney(entry.originalPrice, locale)}</p> : null}</div>{elevated ? <form action={deletePriceEntryAction}><input type="hidden" name="entryId" value={entry.id} /><input type="hidden" name="mutationId" value={mutationIds.prices[entry.id]} /><ConfirmButton type="submit" size="icon" variant="quiet" className="text-[var(--danger)]" title={t("common.delete")} aria-label={t("common.delete")} confirmMessage={t("common.confirm")}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton></form> : null}</div></div>
                {elevated ? <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-[var(--emerald-dark)]">{t("common.edit")}</summary><PriceEntryForm data={data} productId={product.id} entry={entry} /></details> : null}
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 text-sm text-[var(--muted)]">{t("products.noPrice")}</p>}
      </section>
      {elevated ? <PriceEntryForm data={data} productId={product.id} /> : null}
    </div>
  );
}

function ProductCatalog({ initialProducts, initialCursor, query }: { initialProducts: ProductSummary[]; initialCursor: ProductCursor | null; query: string }) {
  const { t } = useT();
  const [products, setProducts] = useState(initialProducts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const parameters = new URLSearchParams({ q: query, cursorName: cursor.name, cursorId: cursor.id });
      const response = await fetch(`/api/products/search?${parameters.toString()}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      const parsed = productSummariesSchema.safeParse(typeof payload === "object" && payload !== null && "products" in payload ? payload.products : null);
      const next = typeof payload === "object" && payload !== null && "nextCursor" in payload ? payload.nextCursor : null;
      const nextParsed = next === null || (typeof next === "object" && next !== null && "name" in next && typeof next.name === "string" && "id" in next && typeof next.id === "string") ? next as ProductCursor | null : undefined;
      if (!response.ok || !parsed.success || nextParsed === undefined) throw new Error("INVALID_SERVER_RESPONSE");
      setProducts((current) => {
        const seen = new Set(current.map((product) => product.id));
        return [...current, ...parsed.data.filter((product) => !seen.has(product.id))];
      });
      setCursor(nextParsed);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "240px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  if (!products.length) return <EmptyState icon={<Search className="h-5 w-5" aria-hidden />} title={t("products.empty")} />;
  return <><ul>{products.map((product) => <ProductRow key={product.id} product={product} query={query} />)}</ul><div ref={sentinelRef} className="grid place-items-center border-t border-[var(--line)] p-3">{cursor ? <Button type="button" variant="quiet" onClick={() => void loadMore()} disabled={loading}>{loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}{failed ? t("common.retry") : t("products.loadMore")}</Button> : <p className="text-xs text-[var(--muted)]">{t("products.endOfResults")}</p>}</div></>;
}

export function ProductsWorkspace({ data, query, elevated, isAdmin }: { data: ProductsData; query: string; elevated: boolean; isAdmin: boolean }) {
  const { t } = useT();
  const catalogKey = `${query}:${data.products.map((product) => product.id).join(",")}:${data.nextCursor?.id ?? "end"}`;
  return (
    <div className="grid gap-6">
      <PageHeading title={t("products.title")} description={t("products.subtitle")} action={<AddProductDialog references={data.references} elevated={elevated} />} />
      <form method="get" className="flex gap-2">
        <label htmlFor="catalog-search" className="screen-reader-only">{t("common.search")}</label>
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden /><Input id="catalog-search" name="q" defaultValue={query} placeholder={t("products.searchPlaceholder")} className="pl-10" /></div>
        <Button type="submit" variant="secondary" size="icon" aria-label={t("common.search")} title={t("common.search")}><Search className="h-5 w-5" aria-hidden /></Button>
      </form>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <Surface><ProductCatalog key={catalogKey} initialProducts={data.products} initialCursor={data.nextCursor} query={query} /></Surface>
        <Surface className="lg:sticky lg:top-24"><ProductDetailPanel data={data} elevated={elevated} isAdmin={isAdmin} /></Surface>
      </div>
    </div>
  );
}
