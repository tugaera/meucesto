"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult, FieldErrors } from "@/lib/actions/types";
import { requireAdmin, requireAdminOrModerator, requireUser } from "@/lib/auth/guards";
import { toErrorCode } from "@/lib/errors";
import { parseLocalizedDecimal } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type ProductMutationResult = ActionResult<{ data: Json; message: string }>;
export const initialProductMutationResult: ProductMutationResult = { success: false, errorCode: "IDLE" };
const object = (formData: FormData) => Object.fromEntries(formData.entries());
const invalid = (error: z.ZodError): ProductMutationResult => ({ success: false, errorCode: "VALIDATION_ERROR", fieldErrors: error.flatten().fieldErrors as FieldErrors });
const failed = (error: unknown): ProductMutationResult => ({ success: false, errorCode: toErrorCode(error) });
const mutationId = (value?: string) => {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : crypto.randomUUID();
};

const productFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200), barcode: z.string().trim().max(80).optional(),
  categoryId: z.union([z.literal(""), z.uuid()]).optional(), subcategoryId: z.union([z.literal(""), z.uuid()]).optional(),
  brandId: z.union([z.literal(""), z.uuid()]).optional(), newBrandName: z.string().trim().max(120).optional(),
  measurementQuantity: z.string().optional(), unitId: z.union([z.literal(""), z.uuid()]).optional(),
  tags: z.string().max(500).optional(), locale: z.enum(["pt", "en"]),
  mutationId: z.string().optional(),
  brandMutationId: z.string().optional(),
});

function tags(value: string | undefined): string[] { return value?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? []; }

export async function createCatalogProductAction(_state: ProductMutationResult, formData: FormData): Promise<ProductMutationResult> {
  const parsed = productFieldsSchema.safeParse(object(formData)); if (!parsed.success) return invalid(parsed.error);
  const measurement = parsed.data.measurementQuantity ? parseLocalizedDecimal(parsed.data.measurementQuantity, parsed.data.locale, 3) : null;
  if ((parsed.data.measurementQuantity && measurement === null) || Boolean(measurement) !== Boolean(parsed.data.unitId)) return { success: false, errorCode: "VALIDATION_ERROR" };
  const { profile } = await requireUser();
  const supabase = await createClient();
  let brandId = parsed.data.brandId || null;
  if (!brandId && parsed.data.newBrandName) {
    const brand = profile.role === "user"
      ? await supabase.rpc("get_or_create_unverified_brand", { name: parsed.data.newBrandName, mutation_id: mutationId(parsed.data.brandMutationId) })
      : await supabase.rpc("catalog_save_brand", { brand_id: null, name: parsed.data.newBrandName, is_active: true, is_verified: true, mutation_id: mutationId(parsed.data.brandMutationId) });
    if (brand.error) return failed(brand.error);
    brandId = typeof brand.data === "object" && brand.data !== null && "id" in brand.data && typeof brand.data.id === "string" ? brand.data.id : null;
  }
  const { data, error } = await supabase.rpc("create_product", { product: { name: parsed.data.name, barcode: parsed.data.barcode || null, categoryId: parsed.data.categoryId || null, subcategoryId: parsed.data.subcategoryId || null, brandId, measurementQuantity: measurement, unitId: parsed.data.unitId || null, tags: tags(parsed.data.tags) }, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath("/products");
  return { success: true, data: { data, message: "PRODUCT_CREATED" } };
}

export async function saveCatalogProductAction(_state: ProductMutationResult, formData: FormData): Promise<ProductMutationResult> {
  await requireAdminOrModerator();
  const parsed = productFieldsSchema.extend({ productId: z.uuid(), isActive: z.string().optional() }).safeParse(object(formData)); if (!parsed.success) return invalid(parsed.error);
  const measurement = parsed.data.measurementQuantity ? parseLocalizedDecimal(parsed.data.measurementQuantity, parsed.data.locale, 3) : null;
  if ((parsed.data.measurementQuantity && measurement === null) || Boolean(measurement) !== Boolean(parsed.data.unitId)) return { success: false, errorCode: "VALIDATION_ERROR" };
  const { data, error } = await (await createClient()).rpc("catalog_save_product", { product_id: parsed.data.productId, product: { name: parsed.data.name, barcode: parsed.data.barcode || null, categoryId: parsed.data.categoryId || null, subcategoryId: parsed.data.subcategoryId || null, brandId: parsed.data.brandId || null, measurementQuantity: measurement, unitId: parsed.data.unitId || null, tags: tags(parsed.data.tags), isActive: parsed.data.isActive === "on" }, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath("/products");
  return { success: true, data: { data, message: "PRODUCT_UPDATED" } };
}

export async function savePriceEntryAction(_state: ProductMutationResult, formData: FormData): Promise<ProductMutationResult> {
  await requireAdminOrModerator();
  const parsed = z.object({ entryId: z.uuid().optional(), productId: z.uuid(), storeId: z.uuid(), price: z.string(), originalPrice: z.string().optional(), quantity: z.string(), effectiveAt: z.string().optional(), locale: z.enum(["pt", "en"]), mutationId: z.string().optional() }).safeParse(object(formData)); if (!parsed.success) return invalid(parsed.error);
  const price = parseLocalizedDecimal(parsed.data.price, parsed.data.locale, 2); const quantity = parseLocalizedDecimal(parsed.data.quantity, parsed.data.locale, 3); const original = parsed.data.originalPrice ? parseLocalizedDecimal(parsed.data.originalPrice, parsed.data.locale, 2) : null;
  if (price === null || quantity === null || (parsed.data.originalPrice && original === null)) return { success: false, errorCode: "VALIDATION_ERROR" };
  const { data, error } = await (await createClient()).rpc("catalog_save_price_entry", { entry_id: parsed.data.entryId ?? null, entry: { productId: parsed.data.productId, storeId: parsed.data.storeId, price, originalPrice: original, quantity, effectiveAt: parsed.data.effectiveAt || new Date().toISOString() }, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath("/products");
  return { success: true, data: { data, message: parsed.data.entryId ? "PRICE_UPDATED" : "PRICE_CREATED" } };
}

export async function deletePriceEntryAction(formData: FormData): Promise<void> {
  await requireAdminOrModerator();
  const parsed = z.object({ entryId: z.uuid(), mutationId: z.string().optional() }).safeParse(object(formData));
  if (!parsed.success) return;
  const { error } = await (await createClient()).rpc("catalog_delete_price_entry", {
    entry_id: parsed.data.entryId,
    mutation_id: mutationId(parsed.data.mutationId),
  });
  if (error) throw new Error(toErrorCode(error));
  revalidatePath("/products");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = z.object({ productId: z.uuid(), mutationId: z.string().optional() }).safeParse(object(formData));
  if (!parsed.success) return;
  const { error } = await (await createClient()).rpc("admin_delete_catalog_entity", {
    entity_type: "product",
    entity_id: parsed.data.productId,
    mutation_id: mutationId(parsed.data.mutationId),
  });
  if (error) throw new Error(toErrorCode(error));
  revalidatePath("/products");
  redirect("/products");
}
