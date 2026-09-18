"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { productSummariesSchema, type ProductSummary } from "@/types/domain";
import { useT } from "@/i18n/provider";

export function ProductTypeahead({ value, onChange, onChoose }: { value: string; onChange: (value: string) => void; onChoose: (product: ProductSummary) => void }) {
  const { t } = useT();
  const listId = useId();
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) return;
    const timer = window.setTimeout(async () => {
      const { data, error } = await createClient().rpc("search_products", { search_text: query, page_size: 8 });
      const parsed = productSummariesSchema.safeParse(data);
      if (!error && parsed.success) { setResults(parsed.data); setOpen(true); }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [value]);
  const visibleResults = value.trim().length >= 2 ? results : [];
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--muted)]" aria-hidden />
      <input id="product-name" name="name" value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open && visibleResults.length > 0} className="min-h-11 w-full border border-[var(--line)] bg-white pl-10 pr-3 text-base sm:text-sm" placeholder={t("shopping.productName")} required />
      {open && visibleResults.length > 0 ? <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto border border-[var(--line)] bg-white shadow-lg">{visibleResults.map((product) => <li key={product.id} role="option" aria-selected="false"><button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2 text-left last:border-0 hover:bg-gray-50" onClick={() => { onChoose(product); setOpen(false); }}><span className="min-w-0"><span className="block truncate text-sm font-semibold">{product.name}</span><span className="block text-xs text-[var(--muted)]">{product.brand?.name ?? product.barcode ?? t("products.noPrice")}</span></span><span className="shrink-0 text-xs font-bold text-[var(--emerald-dark)]">{product.latestPrice?.price ? `€${product.latestPrice.price}` : "—"}</span></button></li>)}</ul> : null}
    </div>
  );
}
