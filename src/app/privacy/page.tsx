"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BarChart3, Bot, Database, FileClock, LockKeyhole, ShoppingBasket, UserRoundCheck } from "lucide-react";
import { useT } from "@/i18n/provider";

const sections = [
  { icon: ShoppingBasket, title: "privacy.dataTitle", body: "privacy.data" },
  { icon: Database, title: "privacy.providersTitle", body: "privacy.providers" },
  { icon: BarChart3, title: "privacy.analyticsTitle", body: "privacy.analytics" },
  { icon: FileClock, title: "privacy.retentionTitle", body: "privacy.retention" },
  { icon: UserRoundCheck, title: "privacy.rightsTitle", body: "privacy.rights" },
  { icon: LockKeyhole, title: "privacy.securityTitle", body: "privacy.security" },
] as const;

export default function PrivacyPage() {
  const { t } = useT();
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-[var(--line)]"><div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4"><Image src="/assets/meu-cesto-mark.png" alt="" width={42} height={42} /><span className="font-bold">Meu Cesto</span></div></header>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <div className="flex h-11 w-11 items-center justify-center bg-[var(--emerald-soft)] text-[var(--emerald-dark)]"><Bot className="h-5 w-5" aria-hidden /></div>
        <h1 className="mt-5 text-3xl font-bold">{t("privacy.title")}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)]">{t("privacy.summary")}</p>
        <div className="mt-10 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {sections.map(({ icon: Icon, title, body }) => <section key={title} className="grid gap-4 py-7 sm:grid-cols-[44px_1fr]"><div className="flex h-11 w-11 items-center justify-center border border-[var(--line)] text-[var(--emerald-dark)]"><Icon className="h-5 w-5" aria-hidden /></div><div><h2 className="font-bold">{t(title)}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t(body)}</p></div></section>)}
        </div>
        <Link href="/auth/login" className="mt-8 inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--emerald-dark)]"><ArrowLeft className="h-4 w-4" aria-hidden />{t("privacy.back")}</Link>
      </div>
    </main>
  );
}
