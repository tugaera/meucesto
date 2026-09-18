"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";
import { signOutAction } from "@/features/auth/actions";
import { useT } from "@/i18n/provider";
import { clearAllOfflineData } from "@/lib/offline/db";

export function SignOutButton() {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(async () => { await clearAllOfflineData(); localStorage.clear(); sessionStorage.clear(); await signOutAction(); })} className="flex min-h-11 w-full items-center gap-3 border-l-2 border-transparent px-3 text-sm font-semibold text-[var(--muted)] hover:bg-gray-50 hover:text-[var(--ink)] disabled:opacity-50"><LogOut className="h-4 w-4" aria-hidden />{t("nav.signOut")}</button>;
}
