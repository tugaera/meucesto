import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(["admin", "moderator", "user"]),
  language: z.enum(["pt", "en"]),
  timezone: z.string(),
  createdAt: z.string(),
});

export type AppProfile = z.infer<typeof profileSchema>;

export async function requireUser(): Promise<{ profile: AppProfile; userId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) {
    console.error("Profile lookup failed", { message: error.message, code: error.code, details: error.details, hint: error.hint });
    redirect("/auth/login?error=NOT_AUTHENTICATED");
  }
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) {
    const recovered = await supabase.rpc("ensure_my_profile");
    if (recovered.error) {
      console.error("Profile recovery failed", { message: recovered.error.message, code: recovered.error.code, details: recovered.error.details, hint: recovered.error.hint });
      redirect("/auth/login?error=NOT_AUTHENTICATED");
    }
    const recovery = profileSchema.safeParse(recovered.data);
    if (!recovery.success) {
      console.error("Profile recovery returned invalid data", { issues: recovery.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) });
      redirect("/auth/login?error=NOT_AUTHENTICATED");
    }
    return { profile: recovery.data, userId: user.id };
  }
  return { profile: parsed.data, userId: user.id };
}

export async function requireAdminOrModerator(): Promise<AppProfile & { role: "admin" | "moderator" }> {
  const { profile } = await requireUser();
  if (profile.role === "user") redirect("/shopping");
  return { ...profile, role: profile.role };
}

export async function requireAdmin(): Promise<AppProfile & { role: "admin" }> {
  const { profile } = await requireUser();
  if (profile.role !== "admin") redirect("/shopping");
  return { ...profile, role: profile.role };
}
