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

function logRpcError(name: string, error: { message: string; code?: string; details?: string; hint?: string }): string {
  const errorCode = toErrorCode(error);
  console.error("Products RPC failed", { name, errorCode, code: error.code, message: error.message, details: error.details, hint: error.hint });
  return errorCode;
}

function parseOrThrow<T>(name: string, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; code: string; message: string }[] } } }, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error("Products RPC returned invalid data", { name, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) });
    throw new Error("INVALID_SERVER_RESPONSE");
  }
  return parsed.data;
}

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
  if (productsResult.error) throw new Error(logRpcError("search_products", productsResult.error));
  if (referencesResult.error) throw new Error(logRpcError("get_catalog_reference_data", referencesResult.error));
  const productPage = parseOrThrow("search_products", productSummariesSchema, productsResult.data);
  const products = productPage.slice(0, PRODUCT_PAGE_SIZE);
  const lastProduct = products.at(-1);
  const nextCursor = productPage.length > PRODUCT_PAGE_SIZE && lastProduct
    ? { name: normalizedName(lastProduct.name), id: lastProduct.id }
    : null;
  const references = parseOrThrow("get_catalog_reference_data", referenceDataSchema, referencesResult.data);
  if (!productId) return { products, nextCursor, references, selected: null, history: [] };
  const [selectedResult, historyResult] = await Promise.all([
    supabase.rpc("get_product_detail", { product_id: productId }),
    supabase.rpc("get_product_price_history", { product_id: productId, page_size: 100 }),
  ]);
  if (selectedResult.error) throw new Error(logRpcError("get_product_detail", selectedResult.error));
  if (historyResult.error) throw new Error(logRpcError("get_product_price_history", historyResult.error));
  return {
    products,
    nextCursor,
    references,
    selected: parseOrThrow("get_product_detail", productDetailSchema, selectedResult.data),
    history: parseOrThrow("get_product_price_history", priceHistorySchema, historyResult.data),
  };
}
