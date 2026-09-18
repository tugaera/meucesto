"use server";

import { redirect } from "next/navigation";
import type { ActionResult, FieldErrors } from "@/lib/actions/types";
import { getServerEnvironment } from "@/lib/env/server";
import { toErrorCode } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, loginSchema, resetPasswordSchema, signupSchema } from "./schemas";

type AuthResult = ActionResult<{ message: "CHECK_EMAIL" | "PASSWORD_UPDATED" }>;

function fields(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

function invalid(error: { flatten: () => { fieldErrors: Record<string, string[]> } }): AuthResult {
  return { success: false, errorCode: "VALIDATION_ERROR", fieldErrors: error.flatten().fieldErrors as FieldErrors };
}

export async function loginAction(_state: AuthResult, formData: FormData): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const environment = getServerEnvironment();
    const limit = await consumeRateLimit({ action: "login", identity: parsed.data.email, maximumAttempts: environment.PASSWORD_RESET_MAX_ATTEMPTS });
    if (!limit.allowed) return { success: false, errorCode: "RATE_LIMITED" };
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { success: false, errorCode: "NOT_AUTHENTICATED" };
  } catch (error) {
    return { success: false, errorCode: toErrorCode(error) };
  }
  redirect("/shopping");
}

export async function signupAction(_state: AuthResult, formData: FormData): Promise<AuthResult> {
  const parsed = signupSchema.safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const environment = getServerEnvironment();
    const limit = await consumeRateLimit({ action: "signup", identity: parsed.data.email, maximumAttempts: environment.INVITE_VALIDATION_MAX_ATTEMPTS });
    if (!limit.allowed) return { success: false, errorCode: "RATE_LIMITED" };
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { invite_code: parsed.data.inviteCode },
        emailRedirectTo: `${environment.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/shopping`,
      },
    });
    if (error) return { success: false, errorCode: error.message.includes("INVITE_INVALID_OR_UNAVAILABLE") ? "INVITE_INVALID_OR_UNAVAILABLE" : "UNKNOWN" };
    return { success: true, data: { message: "CHECK_EMAIL" } };
  } catch (error) {
    return { success: false, errorCode: toErrorCode(error) };
  }
}

export async function forgotPasswordAction(_state: AuthResult, formData: FormData): Promise<AuthResult> {
  const parsed = emailSchema.safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const environment = getServerEnvironment();
    const limit = await consumeRateLimit({ action: "password_reset", identity: parsed.data.email, maximumAttempts: environment.PASSWORD_RESET_MAX_ATTEMPTS });
    if (!limit.allowed) return { success: false, errorCode: "RATE_LIMITED" };
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${environment.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/auth/reset-password`,
    });
    return { success: true, data: { message: "CHECK_EMAIL" } };
  } catch (error) {
    return { success: false, errorCode: toErrorCode(error) };
  }
}

export async function resetPasswordAction(_state: AuthResult, formData: FormData): Promise<AuthResult> {
  const parsed = resetPasswordSchema.safeParse(fields(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, errorCode: "NOT_AUTHENTICATED" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { success: false, errorCode: "UNKNOWN" };
  return { success: true, data: { message: "PASSWORD_UPDATED" } };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
