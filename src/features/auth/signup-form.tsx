"use client";

import Link from "next/link";
import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { useT } from "@/i18n/provider";
import { initialActionResult } from "@/lib/actions/types";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionMessage } from "./action-message";
import { signupAction } from "./actions";

export function SignupForm({ initialCode }: { initialCode: string }) {
  const { t } = useT();
  const [state, action] = useActionState(signupAction, initialActionResult);
  return (
    <form action={action} className="grid gap-5">
      <ActionMessage result={state} />
      <Field label={t("auth.inviteCode")} htmlFor="inviteCode"><Input id="inviteCode" name="inviteCode" defaultValue={initialCode} maxLength={8} autoCapitalize="characters" required /></Field>
      <Field label={t("common.email")} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label={t("auth.password")} htmlFor="password"><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <Field label={t("auth.confirmPassword")} htmlFor="confirmPassword"><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <Link href="/auth/login" className="text-sm font-semibold text-[var(--emerald-dark)]">{t("auth.haveAccount")}</Link>
      <SubmitButton className="w-full"><UserPlus className="h-4 w-4" aria-hidden />{t("auth.createAccount")}</SubmitButton>
    </form>
  );
}
