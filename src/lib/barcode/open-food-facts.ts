import "server-only";

import { z } from "zod";
import { getServerEnvironment } from "@/lib/env/server";
import { normalizeBarcode, parsePackageMeasurement } from "./normalize";

const responseSchema = z.object({
  status: z.number(),
  product: z.object({
    code: z.string().optional(), product_name_pt: z.string().optional(), generic_name_pt: z.string().optional(), product_name: z.string().optional(),
    quantity: z.string().optional(), product_quantity: z.number().optional(), product_quantity_unit: z.string().optional(), brands: z.string().optional(), categories_tags: z.array(z.string()).optional(),
  }).optional(),
}).passthrough();

export interface OpenFoodFactsSuggestion {
  source: "open-food-facts";
  barcode: string;
  name: string;
  brandName: string | null;
  tags: string[];
  measurementQuantity: string | null;
  unitAbbreviation: string | null;
}

interface CacheEntry { expiresAt: number; value: OpenFoodFactsSuggestion | null }
const cache = new Map<string, CacheEntry>();

async function requestProduct(barcode: string, attempt = 0): Promise<OpenFoodFactsSuggestion | null> {
  const environment = getServerEnvironment();
  const fields = "code,product_name_pt,generic_name_pt,product_name,quantity,product_quantity,product_quantity_unit,brands,categories_tags";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}&lc=pt&cc=pt`, {
      headers: { "User-Agent": environment.OPENFOODFACTS_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 1) return requestProduct(barcode, attempt + 1);
    if (!response.ok) return null;
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.status !== 1 || !parsed.data.product) return null;
    const product = parsed.data.product;
    const name = [product.product_name_pt, product.generic_name_pt, product.product_name].find((candidate) => candidate?.trim());
    if (!name) return null;
    const measurement = parsePackageMeasurement(product.quantity, product.product_quantity, product.product_quantity_unit);
    return {
      source: "open-food-facts",
      barcode,
      name: name.trim().slice(0, 200),
      brandName: product.brands?.split(",")[0]?.trim().slice(0, 120) || null,
      tags: (product.categories_tags ?? []).filter((tag) => tag.startsWith("pt:")).map((tag) => tag.slice(3).replaceAll("-", " ")).slice(0, 12),
      measurementQuantity: measurement?.quantity ?? null,
      unitAbbreviation: measurement?.unit ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupOpenFoodFacts(rawBarcode: string): Promise<OpenFoodFactsSuggestion | null> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode || barcode.length > 80) return null;
  const cached = cache.get(barcode);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await requestProduct(barcode);
  cache.set(barcode, { value, expiresAt: Date.now() + (value ? 3_600_000 : 300_000) });
  if (cache.size > 500) cache.delete(cache.keys().next().value ?? "");
  return value;
}
