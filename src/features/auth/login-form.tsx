"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { useT } from "@/i18n/provider";
import { initialActionResult } from "@/lib/actions/types";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionMessage } from "./action-message";
import { loginAction } from "./actions";

export function LoginForm() {
  const { t } = useT();
  const [state, action] = useActionState(loginAction, initialActionResult);
  return (
    <form action={action} className="grid gap-5">
      <ActionMessage result={state} />
      <Field label={t("common.email")} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label={t("auth.password")} htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" minLength={10} required /></Field>
      <div className="flex items-center justify-between gap-4 text-sm">
        <Link href="/auth/signup" className="font-semibold text-[var(--emerald-dark)]">{t("auth.noAccount")}</Link>
        <Link href="/auth/forgot-password" className="text-[var(--muted)] hover:text-[var(--ink)]">{t("auth.forgotPassword")}</Link>
      </div>
      <SubmitButton className="w-full"><LogIn className="h-4 w-4" aria-hidden />{t("auth.signIn")}</SubmitButton>
    </form>
  );
}
