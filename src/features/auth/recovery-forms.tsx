"use client";

import { useActionState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { useT } from "@/i18n/provider";
import { initialActionResult } from "@/lib/actions/types";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionMessage } from "./action-message";
import { forgotPasswordAction, resetPasswordAction } from "./actions";

export function ForgotPasswordForm() {
  const { t } = useT();
  const [state, action] = useActionState(forgotPasswordAction, initialActionResult);
  return <form action={action} className="grid gap-5"><ActionMessage result={state} /><Field label={t("common.email")} htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field><SubmitButton className="w-full"><Mail className="h-4 w-4" aria-hidden />{t("auth.sendRecovery")}</SubmitButton></form>;
}

export function ResetPasswordForm() {
  const { t } = useT();
  const [state, action] = useActionState(resetPasswordAction, initialActionResult);
  return <form action={action} className="grid gap-5"><ActionMessage result={state} /><Field label={t("auth.password")} htmlFor="password"><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></Field><Field label={t("auth.confirmPassword")} htmlFor="confirmPassword"><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></Field><SubmitButton className="w-full"><KeyRound className="h-4 w-4" aria-hidden />{t("auth.updatePassword")}</SubmitButton></form>;
}
