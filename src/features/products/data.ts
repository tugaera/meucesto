import "server-only";

import { createClient } from "@/lib/supabase/server";
import { toErrorCode } from "@/lib/errors";
import {
  priceHistorySchema,
  productDetailSchema,
  productSummariesSchema,
  referenceDataSchema,
  type PriceHistoryEntry,
  type ProductDetail,
  type ProductSummary,
  type ReferenceData,
} from "@/types/domain";

export interface ProductsData {
  products: ProductSummary[];
  nextCursor: ProductCursor | null;
  references: ReferenceData;
  selected: ProductDetail | null;
  history: PriceHistoryEntry[];
}

export interface ProductCursor {
  name: string;
  id: string;
}

const PRODUCT_PAGE_SIZE = 20;

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

export async function loadProducts(
  search: string,
  productId?: string,
  includeInactive = false,
  cursor?: ProductCursor,
): Promise<ProductsData> {
  const supabase = await createClient();
  const [productsResult, referencesResult] = await Promise.all([
    supabase.rpc("search_products", {
      ...(search ? { search_text: search } : {}),
      ...(cursor ? { cursor_name: cursor.name, cursor_id: cursor.id } : {}),
      page_size: PRODUCT_PAGE_SIZE + 1,
      include_inactive: includeInactive,
    }),
    supabase.rpc("get_catalog_reference_data"),
  ]);
  if (productsResult.error) throw new Error(toErrorCode(productsResult.error));
  if (referencesResult.error) throw new Error(toErrorCode(referencesResult.error));
  const productPage = productSummariesSchema.parse(productsResult.data);
  const products = productPage.slice(0, PRODUCT_PAGE_SIZE);
  const lastProduct = products.at(-1);
  const nextCursor = productPage.length > PRODUCT_PAGE_SIZE && lastProduct
    ? { name: normalizedName(lastProduct.name), id: lastProduct.id }
    : null;
  const references = referenceDataSchema.parse(referencesResult.data);
  if (!productId) return { products, nextCursor, references, selected: null, history: [] };
  const [selectedResult, historyResult] = await Promise.all([
    supabase.rpc("get_product_detail", { product_id: productId }),
    supabase.rpc("get_product_price_history", { product_id: productId, page_size: 100 }),
  ]);
  if (selectedResult.error || historyResult.error) throw new Error(toErrorCode(selectedResult.error ?? historyResult.error));
  return { products, nextCursor, references, selected: productDetailSchema.parse(selectedResult.data), history: priceHistorySchema.parse(historyResult.data) };
}
