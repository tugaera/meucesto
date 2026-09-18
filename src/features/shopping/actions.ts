"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult, FieldErrors } from "@/lib/actions/types";
import { requireUser } from "@/lib/auth/guards";
import { toErrorCode } from "@/lib/errors";
import { parseLocalizedDecimal } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type CartMutationResult = ActionResult<{ data: Json; message: string }>;
export const initialCartMutationResult: CartMutationResult = { success: false, errorCode: "IDLE" };

function values(formData: FormData): Record<string, FormDataEntryValue> { return Object.fromEntries(formData.entries()); }
function invalid(error: z.ZodError): CartMutationResult { return { success: false, errorCode: "VALIDATION_ERROR", fieldErrors: error.flatten().fieldErrors as FieldErrors }; }
function failed(error: unknown): CartMutationResult { return { success: false, errorCode: toErrorCode(error) }; }
function mutationId(value: string | undefined): string { return z.uuid().safeParse(value).success ? value as string : crypto.randomUUID(); }

const resourceSchema = z.object({ cartId: z.uuid(), mutationId: z.string().optional() });

export async function setCartStoreAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.extend({ storeId: z.union([z.literal(""), z.uuid()]), revision: z.coerce.number().int().positive() }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_cart_store", { cart_id: parsed.data.cartId, store_id: parsed.data.storeId || null, expected_revision: parsed.data.revision, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath("/shopping");
  return { success: true, data: { data, message: "STORE_UPDATED" } };
}

const addItemSchema = resourceSchema.extend({
  name: z.string().trim().min(1).max(200), barcode: z.string().trim().max(80).optional(), productId: z.union([z.literal(""), z.uuid()]).optional(),
  price: z.string(), originalPrice: z.string().optional(), quantity: z.string(), revision: z.coerce.number().int().positive(), locale: z.enum(["pt", "en"]),
});

export async function addCartItemAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = addItemSchema.safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const price = parseLocalizedDecimal(parsed.data.price, parsed.data.locale, 2);
  const quantity = parseLocalizedDecimal(parsed.data.quantity, parsed.data.locale, 3);
  const originalPrice = parsed.data.originalPrice ? parseLocalizedDecimal(parsed.data.originalPrice, parsed.data.locale, 2) : null;
  if (price === null || quantity === null || (parsed.data.originalPrice && originalPrice === null)) return { success: false, errorCode: "VALIDATION_ERROR" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_or_merge_cart_item", {
    cart_id: parsed.data.cartId,
    item: { name: parsed.data.name, barcode: parsed.data.barcode || null, productId: parsed.data.productId || null, price, originalPrice, quantity },
    expected_revision: parsed.data.revision,
    mutation_id: mutationId(parsed.data.mutationId),
  });
  if (error) return failed(error);
  revalidatePath("/shopping");
  return { success: true, data: { data, message: "ITEM_ADDED" } };
}

export async function updateCartItemAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.extend({ itemId: z.uuid(), itemRevision: z.coerce.number().int().positive(), name: z.string().trim().min(1).max(200), price: z.string(), originalPrice: z.string().optional(), quantity: z.string(), locale: z.enum(["pt", "en"]) }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const price = parseLocalizedDecimal(parsed.data.price, parsed.data.locale, 2);
  const quantity = parseLocalizedDecimal(parsed.data.quantity, parsed.data.locale, 3);
  const originalPrice = parsed.data.originalPrice ? parseLocalizedDecimal(parsed.data.originalPrice, parsed.data.locale, 2) : null;
  if (price === null || quantity === null || (parsed.data.originalPrice && originalPrice === null)) return { success: false, errorCode: "VALIDATION_ERROR" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_cart_item", { cart_id: parsed.data.cartId, item_id: parsed.data.itemId, updates: { name: parsed.data.name, price, originalPrice, quantity }, expected_item_revision: parsed.data.itemRevision, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath("/shopping");
  return { success: true, data: { data, message: "ITEM_UPDATED" } };
}

export async function deleteCartItemAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.extend({ itemId: z.uuid(), itemRevision: z.coerce.number().int().positive() }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_cart_item", { cart_id: parsed.data.cartId, item_id: parsed.data.itemId, expected_item_revision: parsed.data.itemRevision, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath("/shopping");
  return { success: true, data: { data, message: "ITEM_DELETED" } };
}

export async function finalizeCartAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.extend({ checkoutKey: z.uuid() }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_cart", { cart_id: parsed.data.cartId, idempotency_key: parsed.data.checkoutKey, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  redirect(`/history/${parsed.data.cartId}?completed=1`);
}

export async function shareCartAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.extend({ email: z.email().max(320) }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("share_cart_with_email", { cart_id: parsed.data.cartId, email: parsed.data.email, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath("/shopping");
  return { success: true, data: { data, message: "MEMBER_ADDED" } };
}

export async function revokeCartShareAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.extend({ userId: z.uuid() }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_cart_share", { cart_id: parsed.data.cartId, member_user_id: parsed.data.userId, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath("/shopping");
  return { success: true, data: { data, message: "MEMBER_REVOKED" } };
}

export async function rotateCartJoinTokenAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.extend({ maxUses: z.string().optional() }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const maximum = parsed.data.maxUses ? Number.parseInt(parsed.data.maxUses, 10) : null;
  if (maximum !== null && (!Number.isInteger(maximum) || maximum < 1 || maximum > 100)) return { success: false, errorCode: "VALIDATION_ERROR" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_or_rotate_cart_join_token", { cart_id: parsed.data.cartId, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), max_uses: maximum, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  return { success: true, data: { data, message: "TOKEN_CREATED" } };
}

export async function attachTrackingListAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.extend({ listId: z.union([z.literal(""), z.uuid()]), revision: z.coerce.number().int().positive() }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attach_tracking_list", { cart_id: parsed.data.cartId, list_id: parsed.data.listId || null, expected_revision: parsed.data.revision, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath("/shopping");
  return { success: true, data: { data, message: "TRACKING_UPDATED" } };
}

export async function leaveSharedCartAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_shared_cart", { cart_id: parsed.data.cartId, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  redirect("/shopping");
}

export async function deleteActiveCartAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = resourceSchema.safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_active_cart", { cart_id: parsed.data.cartId, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  redirect("/shopping");
}

export async function createProductAndAddAction(_state: CartMutationResult, formData: FormData): Promise<CartMutationResult> {
  const parsed = addItemSchema.extend({
    categoryId: z.union([z.literal(""), z.uuid()]).optional(), subcategoryId: z.union([z.literal(""), z.uuid()]).optional(),
    brandId: z.union([z.literal(""), z.uuid()]).optional(), unitId: z.union([z.literal(""), z.uuid()]).optional(),
    newBrandName: z.string().trim().max(120).optional(), measurementQuantity: z.string().optional(), tags: z.string().max(500).optional(),
    brandMutationId: z.string().optional(), productMutationId: z.string().optional(),
  }).safeParse(values(formData));
  if (!parsed.success) return invalid(parsed.error);
  const price = parseLocalizedDecimal(parsed.data.price, parsed.data.locale, 2);
  const quantity = parseLocalizedDecimal(parsed.data.quantity, parsed.data.locale, 3);
  const originalPrice = parsed.data.originalPrice ? parseLocalizedDecimal(parsed.data.originalPrice, parsed.data.locale, 2) : null;
  const measurement = parsed.data.measurementQuantity ? parseLocalizedDecimal(parsed.data.measurementQuantity, parsed.data.locale, 3) : null;
  if (price === null || quantity === null || (parsed.data.originalPrice && originalPrice === null) || (parsed.data.measurementQuantity && measurement === null)) return { success: false, errorCode: "VALIDATION_ERROR" };
  const { profile } = await requireUser();
  const supabase = await createClient();
  let brandId = parsed.data.brandId || null;
  if (!brandId && parsed.data.newBrandName) {
    const brandResult = profile.role === "user"
      ? await supabase.rpc("get_or_create_unverified_brand", { name: parsed.data.newBrandName, mutation_id: mutationId(parsed.data.brandMutationId) })
      : await supabase.rpc("catalog_save_brand", { brand_id: null, name: parsed.data.newBrandName, is_active: true, is_verified: true, mutation_id: mutationId(parsed.data.brandMutationId) });
    if (brandResult.error) return failed(brandResult.error);
    brandId = typeof brandResult.data === "object" && brandResult.data !== null && "id" in brandResult.data && typeof brandResult.data.id === "string" ? brandResult.data.id : null;
    if (!brandId) return { success: false, errorCode: "UNKNOWN" };
  }
  const productMutationId = mutationId(parsed.data.productMutationId);
  const productResult = await supabase.rpc("create_product", {
    product: {
      name: parsed.data.name, barcode: parsed.data.barcode || null, categoryId: parsed.data.categoryId || null,
      subcategoryId: parsed.data.subcategoryId || null, brandId,
      unitId: parsed.data.unitId || null, measurementQuantity: measurement,
      tags: parsed.data.tags?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [],
    },
    mutation_id: productMutationId,
  });
  if (productResult.error) return failed(productResult.error);
  const productId = typeof productResult.data === "object" && productResult.data !== null && "id" in productResult.data && typeof productResult.data.id === "string" ? productResult.data.id : null;
  if (!productId) return { success: false, errorCode: "UNKNOWN" };
  const cartResult = await supabase.rpc("add_or_merge_cart_item", {
    cart_id: parsed.data.cartId,
    item: { name: parsed.data.name, barcode: parsed.data.barcode || null, productId, price, originalPrice, quantity },
    expected_revision: parsed.data.revision,
    mutation_id: mutationId(parsed.data.mutationId),
  });
  if (cartResult.error) return failed(cartResult.error);
  revalidatePath("/shopping");
  return { success: true, data: { data: cartResult.data, message: "PRODUCT_AND_ITEM_ADDED" } };
}
