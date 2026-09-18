"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { APP_VERSION } from "@/generated/app-version";
import type { TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";

export function AuthShell({ titleKey, introKey, backHref, children }: { titleKey: TranslationKey; introKey: TranslationKey; backHref?: string; children: ReactNode }) {
  const { locale, setLocale, t } = useT();
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(320px,0.9fr)_minmax(480px,1.1fr)]">
      <section className="relative hidden overflow-hidden border-r border-emerald-900 bg-[#0b4f3c] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-xl font-bold">
          <span className="flex h-12 w-12 items-center justify-center bg-white"><Image src="/assets/meu-cesto-mark.png" alt="" width={44} height={44} /></span>
          Meu Cesto
        </div>
        <div className="max-w-md">
          <p className="text-xs font-bold uppercase text-emerald-200">{t("auth.shellEyebrow")}</p>
          <p className="mt-4 text-4xl font-bold leading-tight">{t("auth.shellHeadline")}</p>
          <div className="mt-8 grid grid-cols-3 border-y border-emerald-700 py-5 text-sm text-emerald-100">
            <span>{t("auth.shellPlan")}</span><span>{t("auth.shellCompare")}</span><span>{t("auth.shellKeep")}</span>
          </div>
        </div>
        <p className="text-xs text-emerald-200">{t("auth.shellPrivate")}</p>
      </section>
      <section className="flex min-h-screen flex-col bg-white">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4 lg:hidden">
          <div className="flex items-center gap-2 font-bold"><Image src="/assets/meu-cesto-mark.png" alt="" width={38} height={38} />Meu Cesto</div>
          <Link href="/privacy" className="text-sm font-semibold text-[var(--emerald-dark)]">{t("privacy.title")}</Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-start px-6 py-10 sm:px-10 lg:justify-center">
          <header className="mb-7">
            <h1 className="text-3xl font-bold leading-tight">{t(titleKey)}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t(introKey)}</p>
          </header>
          {children}
          {backHref ? <Link href={backHref} className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--emerald-dark)]"><ArrowLeft className="h-4 w-4" aria-hidden />{t("common.back")}</Link> : null}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-6 py-4 text-xs text-[var(--muted)]">
          <Link href="/changelog" aria-label={t("auth.versionChanges", { version: APP_VERSION })} className="font-medium hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--emerald)]">Meu Cesto v{APP_VERSION}</Link>
          <div className="flex items-center gap-3"><div className="grid grid-cols-2 border border-[var(--line)]" aria-label={t("auth.language")}><button type="button" aria-pressed={locale === "pt"} onClick={() => setLocale("pt")} className="min-h-9 px-2 font-semibold aria-pressed:bg-[var(--emerald-soft)] aria-pressed:text-[var(--emerald-dark)]">PT</button><button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")} className="min-h-9 border-l border-[var(--line)] px-2 font-semibold aria-pressed:bg-[var(--emerald-soft)] aria-pressed:text-[var(--emerald-dark)]">EN</button></div><Link href="/privacy" className="hover:text-[var(--ink)]">{t("privacy.title")}</Link></div>
        </footer>
      </section>
    </main>
  );
}
