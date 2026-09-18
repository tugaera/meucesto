"use client";

import { initialAdminActionResult } from "@/lib/actions/types";
import { ShieldCheck, UserRound } from "lucide-react";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import { updateUserRoleAction } from "./actions";
import { AdminFeedback } from "./admin-feedback";
import type { AdminCursor, AdminUser } from "./data";
import { AdminPagination } from "./pagination";

function UserRoleForm({ user }: { user: AdminUser }) {
  const { t } = useT();
  const [state, action] = useActionState(updateUserRoleAction, initialAdminActionResult);
  const mutationId = useMutationId(state);
  return <form action={action} className="grid grid-cols-[minmax(120px,1fr)_auto] gap-2"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="mutationId" value={mutationId} /><Select name="role" defaultValue={user.role} aria-label={t("admin.role")}><option value="user">{t("admin.role.user")}</option><option value="moderator">{t("admin.role.moderator")}</option><option value="admin">{t("admin.role.admin")}</option></Select><SubmitButton size="icon" title={t("admin.changeRole")} aria-label={t("admin.changeRole")}><ShieldCheck className="h-4 w-4" aria-hidden /></SubmitButton><div className="col-span-2"><AdminFeedback result={state} /></div></form>;
}

export function UsersPanel({ users, isAdmin, nextCursor, cursorActive }: { users: AdminUser[]; isAdmin: boolean; nextCursor: AdminCursor | null; cursorActive: boolean }) {
  const { t, locale } = useT();
  const roleKey = { admin: "admin.role.admin", moderator: "admin.role.moderator", user: "admin.role.user" } as const;
  return <>{users.length ? <ol className="divide-y divide-[var(--line)]">{users.map((user) => <li key={user.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)] sm:items-center"><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#173f34] text-white"><UserRound className="h-5 w-5" aria-hidden /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.email}</p><div className="mt-1 flex flex-wrap gap-2"><Badge tone="info">{t(roleKey[user.role])}</Badge><span className="text-xs text-[var(--muted)]">{t("admin.joined", { date: new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(user.createdAt)) })}</span></div>{user.inviterEmail ? <p className="mt-1 text-xs text-[var(--muted)]">{t("admin.invitedBy", { email: user.inviterEmail })}</p> : null}</div></div>{isAdmin ? <UserRoleForm user={user} /> : null}</li>)}</ol> : <p className="text-sm text-[var(--muted)]">{t("admin.noUsers")}</p>}<AdminPagination kind="users" section="users" cursor={nextCursor} cursorActive={cursorActive} /></>;
}
