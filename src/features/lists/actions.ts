"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult, FieldErrors } from "@/lib/actions/types";
import { toErrorCode } from "@/lib/errors";
import { parseLocalizedDecimal } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type ListMutationResult = ActionResult<{ data: Json; message: string }>;
export const initialListMutationResult: ListMutationResult = { success: false, errorCode: "IDLE" };
const object = (formData: FormData) => Object.fromEntries(formData.entries());
const invalid = (error: z.ZodError): ListMutationResult => ({ success: false, errorCode: "VALIDATION_ERROR", fieldErrors: error.flatten().fieldErrors as FieldErrors });
const failed = (error: unknown): ListMutationResult => ({ success: false, errorCode: toErrorCode(error) });
const mutationId = (value?: string) => z.uuid().safeParse(value).success ? value as string : crypto.randomUUID();

export async function createListAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = z.object({ name: z.string().trim().min(1).max(160), mutationId: z.string().optional() }).safeParse(object(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("create_list", { name: parsed.data.name, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  const id = typeof data === "object" && data !== null && "id" in data && typeof data.id === "string" ? data.id : null;
  if (!id) return { success: false, errorCode: "UNKNOWN" };
  redirect(`/lists/${id}`);
}

const listResourceSchema = z.object({ listId: z.uuid(), mutationId: z.string().optional() });

export async function renameListAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.extend({ name: z.string().trim().min(1).max(160), revision: z.coerce.number().int().positive() }).safeParse(object(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("rename_list", { list_id: parsed.data.listId, name: parsed.data.name, expected_revision: parsed.data.revision, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error);
  revalidatePath(`/lists/${parsed.data.listId}`); revalidatePath("/lists");
  return { success: true, data: { data, message: "LIST_RENAMED" } };
}

export async function deleteListAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.safeParse(object(formData)); if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("delete_list", { list_id: parsed.data.listId, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); redirect("/lists");
}

export async function leaveListAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.safeParse(object(formData)); if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("leave_shared_list", { list_id: parsed.data.listId, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); redirect("/lists");
}

export async function addListItemAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.extend({ name: z.string().trim().min(1).max(200), barcode: z.string().trim().max(80).optional(), productId: z.union([z.literal(""), z.uuid()]).optional(), quantity: z.string(), revision: z.coerce.number().int().positive(), locale: z.enum(["pt", "en"]) }).safeParse(object(formData));
  if (!parsed.success) return invalid(parsed.error);
  const quantity = parseLocalizedDecimal(parsed.data.quantity, parsed.data.locale, 3);
  if (quantity === null || Number(quantity) <= 0) return { success: false, errorCode: "VALIDATION_ERROR" };
  const { data, error } = await (await createClient()).rpc("add_or_merge_list_item", { list_id: parsed.data.listId, item: { name: parsed.data.name, barcode: parsed.data.barcode || null, productId: parsed.data.productId || null, quantity }, expected_revision: parsed.data.revision, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath(`/lists/${parsed.data.listId}`);
  return { success: true, data: { data, message: "ITEM_ADDED" } };
}

export async function updateListItemAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.extend({ itemId: z.uuid(), itemRevision: z.coerce.number().int().positive(), name: z.string().trim().min(1).max(200), barcode: z.string().trim().max(80).optional(), quantity: z.string(), locale: z.enum(["pt", "en"]) }).safeParse(object(formData));
  if (!parsed.success) return invalid(parsed.error);
  const quantity = parseLocalizedDecimal(parsed.data.quantity, parsed.data.locale, 3);
  if (quantity === null || Number(quantity) <= 0) return { success: false, errorCode: "VALIDATION_ERROR" };
  const { data, error } = await (await createClient()).rpc("update_list_item", { list_id: parsed.data.listId, item_id: parsed.data.itemId, updates: { name: parsed.data.name, barcode: parsed.data.barcode || null, quantity }, expected_item_revision: parsed.data.itemRevision, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath(`/lists/${parsed.data.listId}`);
  return { success: true, data: { data, message: "ITEM_UPDATED" } };
}

export async function deleteListItemAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.extend({ itemId: z.uuid(), itemRevision: z.coerce.number().int().positive() }).safeParse(object(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("delete_list_item", { list_id: parsed.data.listId, item_id: parsed.data.itemId, expected_item_revision: parsed.data.itemRevision, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath(`/lists/${parsed.data.listId}`);
  return { success: true, data: { data, message: "ITEM_DELETED" } };
}

export async function shareListAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.extend({ email: z.email().max(320) }).safeParse(object(formData)); if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("share_list_with_email", { list_id: parsed.data.listId, email: parsed.data.email, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath(`/lists/${parsed.data.listId}`);
  return { success: true, data: { data, message: "MEMBER_ADDED" } };
}

export async function revokeListShareAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.extend({ userId: z.uuid() }).safeParse(object(formData)); if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("revoke_list_share", { list_id: parsed.data.listId, member_user_id: parsed.data.userId, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); revalidatePath(`/lists/${parsed.data.listId}`);
  return { success: true, data: { data, message: "MEMBER_REVOKED" } };
}

export async function rotateListTokenAction(_state: ListMutationResult, formData: FormData): Promise<ListMutationResult> {
  const parsed = listResourceSchema.extend({ maxUses: z.string().optional() }).safeParse(object(formData)); if (!parsed.success) return invalid(parsed.error);
  const maximum = parsed.data.maxUses ? Number.parseInt(parsed.data.maxUses, 10) : null;
  if (maximum !== null && (!Number.isInteger(maximum) || maximum < 1 || maximum > 100)) return { success: false, errorCode: "VALIDATION_ERROR" };
  const { data, error } = await (await createClient()).rpc("create_or_rotate_list_join_token", { list_id: parsed.data.listId, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), max_uses: maximum, mutation_id: mutationId(parsed.data.mutationId) });
  if (error) return failed(error); return { success: true, data: { data, message: "TOKEN_CREATED" } };
}
