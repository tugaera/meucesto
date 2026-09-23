"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, FieldErrors } from "@/lib/actions/types";
import { requireAdmin, requireAdminOrModerator } from "@/lib/auth/guards";
import { sendInvitationEmail } from "@/lib/email";
import { getServerEnvironment } from "@/lib/env/server";
import { toErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type AdminActionResult = ActionResult<{ message: string; data?: Json; invite?: { id: string; code: string; link: string; email: string | null; deliveryError: string | null } }>;
const initialAdminActionResult: AdminActionResult = { success: false, errorCode: "IDLE" };
const fields = (formData: FormData) => Object.fromEntries(formData.entries());
const invalid = (error: z.ZodError): AdminActionResult => ({ success: false, errorCode: "VALIDATION_ERROR", fieldErrors: error.flatten().fieldErrors as FieldErrors });
const failed = (error: unknown): AdminActionResult => ({ success: false, errorCode: toErrorCode(error) });
const optionalUuid = z.union([z.literal(""), z.uuid()]);
const mutationId = (value?: string) => {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : crypto.randomUUID();
};

const inviteResultSchema = z.object({ id: z.uuid(), code: z.string().length(8), email: z.string().nullable(), role: z.enum(["admin", "moderator", "user"]), expiresAt: z.string() });

export async function createInviteAction(_state: AdminActionResult, formData: FormData): Promise<AdminActionResult> {
  const profile = await requireAdminOrModerator();
  const parsed = z.object({ email: z.union([z.literal(""), z.email()]), role: z.enum(["admin", "moderator", "user"]), expiryDays: z.coerce.number().int().min(1).max(90), delivery: z.enum(["generate", "send"]), mutationId: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  if (profile.role === "moderator" && parsed.data.role !== "user") return { success: false, errorCode: "NOT_AUTHORIZED" };
  if (parsed.data.delivery === "send" && !parsed.data.email) return { success: false, errorCode: "VALIDATION_ERROR" };
  const supabase = await createClient();
  const created = await supabase.rpc("create_invite", {
    email: parsed.data.email,
    assigned_role: parsed.data.role,
    expires_at: new Date(Date.now() + parsed.data.expiryDays * 86_400_000).toISOString(),
    mutation_id: mutationId(parsed.data.mutationId),
  });
  if (created.error) return failed(created.error);
  const invite = inviteResultSchema.safeParse(created.data);
  if (!invite.success) return { success: false, errorCode: "UNKNOWN" };
  const environment = getServerEnvironment();
  const link = `${environment.NEXT_PUBLIC_SITE_URL}/auth/signup?code=${encodeURIComponent(invite.data.code)}`;
  let deliveryError: string | null = null;
  if (parsed.data.delivery === "send" && invite.data.email) {
    const delivery = await sendInvitationEmail({ recipient: invite.data.email, code: invite.data.code, signupUrl: link, inviteId: invite.data.id }, environment);
    if (!delivery.success) deliveryError = delivery.errorCode;
  }
  revalidatePath("/admin");
  return { success: true, data: { message: deliveryError ? "INVITE_CREATED_EMAIL_FAILED" : "INVITE_CREATED", invite: { id: invite.data.id, code: invite.data.code, link, email: invite.data.email, deliveryError } } };
}

export async function revokeInviteAction(_state: AdminActionResult, formData: FormData): Promise<AdminActionResult> {
  await requireAdminOrModerator();
  const parsed = z.object({ inviteId: z.uuid(), mutationId: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("revoke_invite", { invite_id: parsed.data.inviteId, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath("/admin");
  return { success: true, data: { message: "INVITE_REVOKED", data } };
}

export async function updateUserRoleAction(_state: AdminActionResult, formData: FormData): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = z.object({ userId: z.uuid(), role: z.enum(["admin", "moderator", "user"]), mutationId: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("admin_update_user_role", { user_id: parsed.data.userId, role: parsed.data.role, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath("/admin");
  return { success: true, data: { message: "ROLE_UPDATED", data } };
}

export async function saveStoreAction(_state: AdminActionResult, formData: FormData): Promise<AdminActionResult> {
  await requireAdminOrModerator();
  const parsed = z.object({ storeId: optionalUuid, name: z.string().trim().min(1).max(120), sortOrder: z.union([z.literal(""), z.coerce.number().int()]), isActive: z.string().optional(), mutationId: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("catalog_save_store", { store_id: parsed.data.storeId || null, name: parsed.data.name, is_active: parsed.data.isActive === "on", sort_order: parsed.data.sortOrder === "" ? null : parsed.data.sortOrder, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath("/admin");
  return { success: true, data: { message: "CATALOG_SAVED", data } };
}

export async function saveCategoryAction(_state: AdminActionResult, formData: FormData): Promise<AdminActionResult> {
  await requireAdminOrModerator();
  const parsed = z.object({ categoryId: optionalUuid, name: z.string().trim().min(1).max(120), parentId: optionalUuid, sortOrder: z.union([z.literal(""), z.coerce.number().int()]), isActive: z.string().optional(), mutationId: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("catalog_save_category", { category_id: parsed.data.categoryId || null, name: parsed.data.name, parent_id: parsed.data.parentId || null, is_active: parsed.data.isActive === "on", sort_order: parsed.data.sortOrder === "" ? null : parsed.data.sortOrder, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath("/admin");
  return { success: true, data: { message: "CATALOG_SAVED", data } };
}

export async function saveBrandAction(_state: AdminActionResult, formData: FormData): Promise<AdminActionResult> {
  await requireAdminOrModerator();
  const parsed = z.object({ brandId: optionalUuid, name: z.string().trim().min(1).max(120), isActive: z.string().optional(), isVerified: z.string().optional(), mutationId: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("catalog_save_brand", { brand_id: parsed.data.brandId || null, name: parsed.data.name, is_active: parsed.data.isActive === "on", is_verified: parsed.data.isVerified === "on", mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath("/admin");
  return { success: true, data: { message: "CATALOG_SAVED", data } };
}

export async function saveUnitAction(_state: AdminActionResult, formData: FormData): Promise<AdminActionResult> {
  await requireAdminOrModerator();
  const parsed = z.object({ unitId: optionalUuid, name: z.string().trim().min(1).max(80), abbreviation: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{0,15}$/), baseUnitId: optionalUuid, baseUnitFactor: z.string().trim().optional(), replacementDefaultId: optionalUuid, isActive: z.string().optional(), makeDefault: z.string().optional(), mutationId: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("catalog_save_unit", { unit_id: parsed.data.unitId || null, name: parsed.data.name, abbreviation: parsed.data.abbreviation.toLowerCase(), base_unit_id: parsed.data.baseUnitId || null, base_unit_factor: parsed.data.baseUnitFactor || null, is_active: parsed.data.isActive === "on", make_default: parsed.data.makeDefault === "on", replacement_default_id: parsed.data.replacementDefaultId || null, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath("/admin");
  return { success: true, data: { message: "CATALOG_SAVED", data } };
}

export async function deleteCatalogEntityAction(_state: AdminActionResult, formData: FormData): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = z.object({ entityType: z.enum(["category", "brand", "unit", "product"]), entityId: z.uuid(), deleteMutationId: z.string().optional(), mutationId: z.string().optional() }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("admin_delete_catalog_entity", { entity_type: parsed.data.entityType, entity_id: parsed.data.entityId, mutation_id: mutationId(parsed.data.deleteMutationId ?? parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath("/admin");
  return { success: true, data: { message: "CATALOG_DELETED", data } };
}

export async function deleteCatalogEntityDirectAction(formData: FormData): Promise<void> {
  const result = await deleteCatalogEntityAction(initialAdminActionResult, formData);
  if (!result.success) throw new Error(result.errorCode);
}
