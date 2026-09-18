"use client";

import { Download, KeyRound, Languages, ShieldAlert, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeading, Surface } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/submit-button";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import type { AppProfile } from "@/lib/auth/guards";
import { clearAllOfflineData } from "@/lib/offline/db";
import { changePasswordAction, deleteAccountAction, initialProfileActionResult, updatePreferencesAction, type ProfileActionResult } from "./actions";

function Feedback({ result }: { result: ProfileActionResult }) {
  const { t } = useT();
  if (!result.success && result.errorCode === "IDLE") return null;
  if (result.success) return <p role="status" className="text-sm font-semibold text-emerald-800">{t(result.data.message === "PASSWORD_UPDATED" ? "auth.passwordUpdated" : "profile.saved")}</p>;
  const candidate = `errors.${result.errorCode}`;
  const key: TranslationKey = candidate in dictionaries.en ? candidate as TranslationKey : "errors.UNKNOWN";
  return <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(key)}</p>;
}

function AccountDeletionForm() {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(deleteAccountAction, initialProfileActionResult);
  const [mutationId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!state.success) return;
    void clearAllOfflineData().then(() => {
      localStorage.clear();
      sessionStorage.clear();
      return caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
    }).finally(() => { router.replace("/auth/login"); router.refresh(); });
  }, [router, state]);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="mutationId" value={mutationId} />
      <p className="text-sm leading-6 text-[var(--muted)]">{t("profile.deleteWarning")}</p>
      <Field label={t("profile.reauthenticate")} htmlFor="delete-current-password"><Input id="delete-current-password" name="currentPassword" type="password" autoComplete="current-password" required /></Field>
      <Field label={t("profile.deletePhrase")} htmlFor="delete-confirmation"><Input id="delete-confirmation" name="confirmation" autoComplete="off" required /></Field>
      <Feedback result={state} />
      <SubmitButton variant="danger"><ShieldAlert className="h-4 w-4" aria-hidden />{t("profile.deleteAccount")}</SubmitButton>
    </form>
  );
}

export function ProfileWorkspace({ profile }: { profile: AppProfile }) {
  const { t, locale } = useT();
  const roleKey = { admin: "profile.role.admin", moderator: "profile.role.moderator", user: "profile.role.user" } as const;
  const [preferencesState, preferencesAction] = useActionState(updatePreferencesAction, initialProfileActionResult);
  const [passwordState, passwordAction] = useActionState(changePasswordAction, initialProfileActionResult);
  const preferencesMutationId = useMutationId(preferencesState);
  return (
    <div className="grid gap-6">
      <PageHeading title={t("profile.title")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Surface className="p-4 sm:p-5"><section aria-labelledby="account-heading" className="grid gap-4"><h2 id="account-heading" className="flex items-center gap-2 text-lg font-bold"><UserRound className="h-5 w-5" aria-hidden />{t("profile.account")}</h2><div><p className="text-sm font-semibold">{profile.email}</p><div className="mt-2 flex flex-wrap gap-2"><Badge tone="info">{t(roleKey[profile.role])}</Badge><Badge>{new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(profile.createdAt))}</Badge></div></div></section></Surface>
        <Surface className="p-4 sm:p-5"><section aria-labelledby="preferences-heading" className="grid gap-4"><h2 id="preferences-heading" className="flex items-center gap-2 text-lg font-bold"><Languages className="h-5 w-5" aria-hidden />{t("profile.preferences")}</h2><form action={preferencesAction} className="grid gap-4"><input type="hidden" name="mutationId" value={preferencesMutationId} /><Field label={t("profile.language")} htmlFor="profile-language"><Select id="profile-language" name="language" defaultValue={profile.language}><option value="pt">Português</option><option value="en">English</option></Select></Field><Field label={t("profile.timezone")} htmlFor="profile-timezone"><Input id="profile-timezone" name="timezone" defaultValue={profile.timezone} list="timezone-suggestions" required /><datalist id="timezone-suggestions"><option value="Europe/Lisbon" /><option value="Atlantic/Azores" /><option value="Europe/London" /></datalist></Field><Feedback result={preferencesState} /><SubmitButton>{t("common.save")}</SubmitButton></form></section></Surface>
        <Surface className="p-4 sm:p-5"><section aria-labelledby="security-heading" className="grid gap-4"><h2 id="security-heading" className="flex items-center gap-2 text-lg font-bold"><KeyRound className="h-5 w-5" aria-hidden />{t("profile.security")}</h2><form action={passwordAction} className="grid gap-4"><Field label={t("profile.reauthenticate")} htmlFor="password-current"><Input id="password-current" name="currentPassword" type="password" autoComplete="current-password" required /></Field><Field label={t("profile.newPassword")} htmlFor="password-new"><Input id="password-new" name="password" type="password" minLength={10} autoComplete="new-password" required /></Field><Field label={t("auth.confirmPassword")} htmlFor="password-confirm"><Input id="password-confirm" name="confirmPassword" type="password" minLength={10} autoComplete="new-password" required /></Field><Feedback result={passwordState} /><SubmitButton>{t("profile.changePassword")}</SubmitButton></form></section></Surface>
        <Surface className="p-4 sm:p-5"><section aria-labelledby="data-heading" className="grid gap-4"><h2 id="data-heading" className="flex items-center gap-2 text-lg font-bold"><Download className="h-5 w-5" aria-hidden />{t("profile.data")}</h2><p className="text-sm leading-6 text-[var(--muted)]">{t("profile.exportHelp")}</p><form action="/api/profile/export" method="post" className="grid gap-3"><Field label={t("profile.reauthenticate")} htmlFor="export-current-password"><Input id="export-current-password" name="currentPassword" type="password" autoComplete="current-password" required /></Field><SubmitButton variant="secondary"><Download className="h-4 w-4" aria-hidden />{t("profile.export")}</SubmitButton></form></section></Surface>
      </div>
      <Surface className="border-red-200 p-4 sm:p-5"><section aria-labelledby="delete-heading" className="grid gap-4"><h2 id="delete-heading" className="text-lg font-bold text-[var(--danger)]">{t("profile.deleteAccount")}</h2><AccountDeletionForm /></section></Surface>
    </div>
  );
}
