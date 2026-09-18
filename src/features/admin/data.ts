import "server-only";

import { z } from "zod";
import { requireAdminOrModerator, type AppProfile } from "@/lib/auth/guards";
import { toErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { referenceDataSchema, type ReferenceData } from "@/types/domain";

const userSchema = z.object({ id: z.uuid(), email: z.string(), role: z.enum(["admin", "moderator", "user"]), createdAt: z.string(), inviterEmail: z.string().nullable().optional() });
const inviteSchema = z.object({ id: z.uuid(), email: z.string().nullable().optional(), assignedRole: z.enum(["admin", "moderator", "user"]), createdAt: z.string(), expiresAt: z.string(), usedAt: z.string().nullable(), revokedAt: z.string().nullable(), createdByMe: z.boolean() });
const auditSchema = z.object({ id: z.uuid(), action: z.string(), entityType: z.string().nullable(), entityId: z.uuid().nullable(), metadata: z.record(z.string(), z.unknown()), createdAt: z.string(), actor: z.object({ id: z.uuid(), email: z.string() }).nullable() });

export type AdminUser = z.infer<typeof userSchema>;
export type AdminInvite = z.infer<typeof inviteSchema>;
export type AuditEvent = z.infer<typeof auditSchema>;
export interface AdminCursor { createdAt: string; id: string }

export interface AdminData {
  profile: AppProfile & { role: "admin" | "moderator" };
  users: AdminUser[];
  invites: AdminInvite[];
  audit: AuditEvent[];
  references: ReferenceData;
  nextUsersCursor: AdminCursor | null;
  nextInvitesCursor: AdminCursor | null;
  nextAuditCursor: AdminCursor | null;
}

function logRpcError(name: string, error: { message: string; code?: string; details?: string; hint?: string }): string {
  const errorCode = toErrorCode(error);
  console.error("Admin RPC failed", { name, errorCode, code: error.code, message: error.message, details: error.details, hint: error.hint });
  return errorCode;
}

function logInvalidData(name: string, result: { success: true } | { success: false; error: z.ZodError }): void {
  if (result.success) return;
  console.error("Admin RPC returned invalid data", { name, issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) });
}

export async function loadAdminData(cursors: { users?: AdminCursor; invites?: AdminCursor; audit?: AdminCursor } = {}): Promise<AdminData> {
  const profile = await requireAdminOrModerator();
  const supabase = await createClient();
  const requests = await Promise.all([
    supabase.rpc("admin_list_users", { ...(cursors.users ? { cursor_created_at: cursors.users.createdAt, cursor_id: cursors.users.id } : {}), page_size: 21 }),
    supabase.rpc("list_invites", { ...(cursors.invites ? { cursor_created_at: cursors.invites.createdAt, cursor_id: cursors.invites.id } : {}), page_size: 21 }),
    supabase.rpc("get_catalog_reference_data"),
    profile.role === "admin" ? supabase.rpc("get_sanitized_audit_page", { ...(cursors.audit ? { cursor_created_at: cursors.audit.createdAt, cursor_id: cursors.audit.id } : {}), page_size: 21 }) : Promise.resolve({ data: [], error: null }),
  ]);
  const requestNames = ["admin_list_users", "list_invites", "get_catalog_reference_data", "get_sanitized_audit_page"] as const;
  const firstErrorIndex = requests.findIndex((result) => result.error);
  if (firstErrorIndex >= 0) {
    const failedRequest = requests[firstErrorIndex];
    const requestName = requestNames[firstErrorIndex] ?? "unknown_admin_rpc";
    if (failedRequest?.error) throw new Error(logRpcError(requestName, failedRequest.error));
  }
  const users = z.array(userSchema).safeParse(requests[0].data);
  const invites = z.array(inviteSchema).safeParse(requests[1].data);
  const references = referenceDataSchema.safeParse(requests[2].data);
  const audit = z.array(auditSchema).safeParse(requests[3].data);
  logInvalidData("admin_list_users", users);
  logInvalidData("list_invites", invites);
  logInvalidData("get_catalog_reference_data", references);
  logInvalidData("get_sanitized_audit_page", audit);
  if (!users.success || !invites.success || !references.success || !audit.success) throw new Error("INVALID_SERVER_RESPONSE");
  const usersVisible = users.data.slice(0, 20);
  const invitesVisible = invites.data.slice(0, 20);
  const auditVisible = audit.data.slice(0, 20);
  const usersLast = usersVisible.at(-1);
  const invitesLast = invitesVisible.at(-1);
  const auditLast = auditVisible.at(-1);
  return {
    profile,
    users: usersVisible,
    invites: invitesVisible,
    references: references.data,
    audit: auditVisible,
    nextUsersCursor: users.data.length > 20 && usersLast ? { createdAt: usersLast.createdAt, id: usersLast.id } : null,
    nextInvitesCursor: invites.data.length > 20 && invitesLast ? { createdAt: invitesLast.createdAt, id: invitesLast.id } : null,
    nextAuditCursor: audit.data.length > 20 && auditLast ? { createdAt: auditLast.createdAt, id: auditLast.id } : null,
  };
}
