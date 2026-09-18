"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ActionResult } from "@/lib/actions/types";
import { useT } from "@/i18n/provider";
import { dictionaries, type TranslationKey } from "@/i18n";

export function ActionMessage({ result }: { result: ActionResult<{ message: "CHECK_EMAIL" | "PASSWORD_UPDATED" }> }) {
  const { t } = useT();
  if (!result.success && result.errorCode === "IDLE") return null;
  if (result.success) {
    const key = result.data.message === "CHECK_EMAIL" ? "auth.checkEmail" : "auth.passwordUpdated";
    return <p role="status" className="flex items-start gap-2 border border-emerald-200 bg-[var(--emerald-soft)] p-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t(key)}</p>;
  }
  const candidate = `errors.${result.errorCode}`;
  const key: TranslationKey = candidate in dictionaries.en ? candidate as TranslationKey : "errors.UNKNOWN";
  return <p role="alert" className="flex items-start gap-2 border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t(key)}</p>;
}
