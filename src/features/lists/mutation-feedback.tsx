"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import type { ListMutationResult } from "./actions";

export function ListMutationFeedback({ result }: { result: ListMutationResult }) {
  const { t } = useT();
  if (!result.success && result.errorCode === "IDLE") return null;
  if (result.success) return <p role="status" className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden />{t("sync.current")}</p>;
  const candidate = `errors.${result.errorCode}`;
  const key: TranslationKey = candidate in dictionaries.en ? candidate as TranslationKey : "errors.UNKNOWN";
  return <p role="alert" className="flex items-start gap-2 border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden />{t(key)}</p>;
}
