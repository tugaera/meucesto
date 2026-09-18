"use client";

import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import type { AdminActionResult } from "./actions";

export function AdminFeedback({ result }: { result: AdminActionResult }) {
  const { t } = useT();
  if (!result.success && result.errorCode === "IDLE") return null;
  if (result.success) return <p role="status" className="text-sm font-semibold text-emerald-800">{t("profile.saved")}</p>;
  const candidate = `errors.${result.errorCode}`;
  const key: TranslationKey = candidate in dictionaries.en ? candidate as TranslationKey : "errors.UNKNOWN";
  return <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(key)}</p>;
}
