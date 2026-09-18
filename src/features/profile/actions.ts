"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, FieldErrors } from "@/lib/actions/types";
import { requireUser } from "@/lib/auth/guards";
import { getServerEnvironment } from "@/lib/env/server";
import { toErrorCode } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionResult = ActionResult<{ message: string }>;
export const initialProfileActionResult: ProfileActionResult = { success: false, errorCode: "IDLE" };
const fields = (formData: FormData) => Object.fromEntries(formData.entries());
const invalid = (error: z.ZodError): ProfileActionResult => ({ success: false, errorCode: "VALIDATION_ERROR", fieldErrors: error.flatten().fieldErrors as FieldErrors });
const mutationIdSchema = z.uuid();

async function verifyCurrentPassword(password: string): Promise<{ valid: boolean; userId: string; email: string }> {
  const { userId, profile } = await requireUser();
  const supabase = await createClient();
  const result = await supabase.auth.signInWithPassword({ email: profile.email, password });
  return { valid: !result.error && result.data.user?.id === userId, userId, email: profile.email };
}

export async function updatePreferencesAction(_state: ProfileActionResult, formData: FormData): Promise<ProfileActionResult> {
  const parsed = z.object({ language: z.enum(["pt", "en"]), timezone: z.string().trim().min(1).max(80), mutationId: mutationIdSchema }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  await requireUser();
  const { error } = await (await createClient()).rpc("update_my_preferences", { language: parsed.data.language, timezone: parsed.data.timezone, mutation_id: parsed.data.mutationId });
  if (error) return { success: false, errorCode: toErrorCode(error) };
  revalidatePath("/profile");
  return { success: true, data: { message: "PREFERENCES_UPDATED" } };
}

export async function changePasswordAction(_state: ProfileActionResult, formData: FormData): Promise<ProfileActionResult> {
  const parsed = z.object({ currentPassword: z.string().min(1), password: z.string().min(10).max(128), confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "PASSWORD_MISMATCH" }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const verified = await verifyCurrentPassword(parsed.data.currentPassword);
  if (!verified.valid) return { success: false, errorCode: "CURRENT_PASSWORD_INVALID" };
  const { error } = await (await createClient()).auth.updateUser({ password: parsed.data.password });
  if (error) return { success: false, errorCode: "PASSWORD_UPDATE_FAILED" };
  return { success: true, data: { message: "PASSWORD_UPDATED" } };
}

const deletionResultSchema = z.object({ userId: z.uuid(), receiptObjectPaths: z.array(z.string()), ownedCartCount: z.number().int(), ownedListCount: z.number().int() });

export async function deleteAccountAction(_state: ProfileActionResult, formData: FormData): Promise<ProfileActionResult> {
  const parsed = z.object({ currentPassword: z.string().min(1), confirmation: z.literal("DELETE"), mutationId: mutationIdSchema }).safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const verified = await verifyCurrentPassword(parsed.data.currentPassword);
  if (!verified.valid) return { success: false, errorCode: "CURRENT_PASSWORD_INVALID" };
  const supabase = await createClient();
  const prepared = await supabase.rpc("prepare_account_deletion", { mutation_id: parsed.data.mutationId });
  if (prepared.error) return { success: false, errorCode: toErrorCode(prepared.error) };
  const deletion = deletionResultSchema.safeParse(prepared.data);
  if (!deletion.success || deletion.data.userId !== verified.userId) return { success: false, errorCode: "UNKNOWN" };
  const admin = createAdminClient();
  const environment = getServerEnvironment();
  const scheduled = await admin.rpc("schedule_deleted_account_receipt_purge", {
    deleted_user_id: verified.userId,
    receipt_object_paths: deletion.data.receiptObjectPaths,
    retention_days: environment.RECEIPT_DELETION_GRACE_DAYS,
  });
  if (scheduled.error || typeof scheduled.data !== "string") return { success: false, errorCode: "UNKNOWN" };
  const deleted = await admin.auth.admin.deleteUser(verified.userId, false);
  if (deleted.error) {
    await admin.rpc("complete_retention_job", { job_id: scheduled.data, succeeded: true });
    return { success: false, errorCode: "ACCOUNT_DELETE_FAILED" };
  }
  await supabase.auth.signOut();
  return { success: true, data: { message: "ACCOUNT_DELETED" } };
}
