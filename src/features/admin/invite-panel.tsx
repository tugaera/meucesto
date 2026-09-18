"use client";

import { Ban, MailPlus, TicketCheck } from "lucide-react";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import { createInviteAction, initialAdminActionResult, revokeInviteAction } from "./actions";
import { AdminFeedback } from "./admin-feedback";
import { CopyButton } from "./copy-button";
import type { AdminCursor, AdminInvite } from "./data";
import { AdminPagination } from "./pagination";

function RevokeInvite({ inviteId }: { inviteId: string }) {
  const { t } = useT();
  const [state, action] = useActionState(revokeInviteAction, initialAdminActionResult);
  const mutationId = useMutationId(state);
  return <form action={action} className="grid gap-2"><input type="hidden" name="inviteId" value={inviteId} /><input type="hidden" name="mutationId" value={mutationId} /><ConfirmButton type="submit" variant="quiet" size="compact" className="text-[var(--danger)]" confirmMessage={t("common.confirm")}><Ban className="h-4 w-4" aria-hidden />{t("common.remove")}</ConfirmButton><AdminFeedback result={state} /></form>;
}

export function InvitePanel({ invites, role, nextCursor, cursorActive }: { invites: AdminInvite[]; role: "admin" | "moderator"; nextCursor: AdminCursor | null; cursorActive: boolean }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(createInviteAction, initialAdminActionResult);
  const mutationId = useMutationId(state);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(value));
  const createdInvite = state.success ? state.data.invite : null;
  return (
    <div className="grid gap-6">
      <form action={action} className="grid gap-4 border-b border-[var(--line)] pb-6">
        <input type="hidden" name="mutationId" value={mutationId} />
        <h2 className="flex items-center gap-2 text-lg font-bold"><MailPlus className="h-5 w-5" aria-hidden />{t("admin.createInvite")}</h2>
        <div className="grid gap-4 sm:grid-cols-2"><Field label={`${t("common.email")} (${t("common.optional")})`} htmlFor="invite-email"><Input id="invite-email" name="email" type="email" autoComplete="email" /></Field><Field label={t("admin.role")} htmlFor="invite-role"><Select id="invite-role" name="role" defaultValue="user"><option value="user">{t("admin.role.user")}</option>{role === "admin" ? <><option value="moderator">{t("admin.role.moderator")}</option><option value="admin">{t("admin.role.admin")}</option></> : null}</Select></Field></div>
        <Field label={t("admin.expiryDays")} htmlFor="invite-expiry"><Input id="invite-expiry" name="expiryDays" type="number" min={1} max={90} defaultValue={7} required /></Field>
        <fieldset className="grid grid-cols-2 border border-[var(--line)]"><legend className="screen-reader-only">{t("common.send")}</legend><label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 border-r border-[var(--line)] px-3 text-sm font-semibold has-[:checked]:bg-[var(--emerald-soft)] has-[:checked]:text-[var(--emerald-dark)]"><input type="radio" name="delivery" value="generate" defaultChecked />{t("admin.generateOnly")}</label><label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 px-3 text-sm font-semibold has-[:checked]:bg-[var(--emerald-soft)] has-[:checked]:text-[var(--emerald-dark)]"><input type="radio" name="delivery" value="send" />{t("admin.generateAndSend")}</label></fieldset>
        <AdminFeedback result={state} />
        <SubmitButton><TicketCheck className="h-4 w-4" aria-hidden />{t("admin.createInvite")}</SubmitButton>
      </form>
      {createdInvite ? <section aria-labelledby="created-invite-title" className="border-l-4 border-[var(--emerald)] bg-[var(--emerald-soft)] p-4"><h3 id="created-invite-title" className="font-bold">{t("admin.inviteCreated", { code: createdInvite.code })}</h3><p className="mt-1 text-sm text-[var(--muted)]">{createdInvite.deliveryError ? t("admin.deliveryFailed") : t("admin.inviteReady")}</p><label htmlFor="created-invite-link" className="mt-4 block text-xs font-semibold">{t("admin.inviteLink")}</label><div className="mt-1 flex gap-2"><Input id="created-invite-link" value={createdInvite.link} readOnly /><CopyButton value={createdInvite.link} /></div></section> : null}
      <section aria-labelledby="invite-list-title"><h2 id="invite-list-title" className="text-lg font-bold">{t("admin.invites")}</h2>{invites.length ? <ol className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">{invites.map((invite) => { const status = invite.usedAt ? "used" : invite.revokedAt ? "revoked" : new Date(invite.expiresAt) <= new Date() ? "expired" : "active"; return <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{invite.email ?? t("common.none")}</p><Badge tone={status === "active" ? "success" : status === "used" ? "info" : "danger"}>{t(`admin.${status}`)}</Badge><Badge>{t(`admin.role.${invite.assignedRole}`)}</Badge></div><p className="mt-1 text-xs text-[var(--muted)]">{t("admin.expires", { date: date(invite.expiresAt) })}</p></div>{status === "active" ? <RevokeInvite inviteId={invite.id} /> : null}</li>; })}</ol> : <p className="mt-3 text-sm text-[var(--muted)]">{t("admin.noInvites")}</p>}<AdminPagination kind="invites" section="users" cursor={nextCursor} cursorActive={cursorActive} /></section>
    </div>
  );
}
