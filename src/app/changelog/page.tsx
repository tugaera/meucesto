"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { CHANGELOG } from "@/generated/changelog";
import { APP_VERSION } from "@/generated/app-version";
import { useT } from "@/i18n/provider";

export default function ChangelogPage() {
  const { t } = useT();
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-[var(--line)]"><div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4"><Image src="/assets/meu-cesto-mark.png" alt="" width={42} height={42} /><span className="font-bold">Meu Cesto</span></div></header>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-xs font-bold uppercase text-[var(--emerald-dark)]">{t("changelog.current")} · v{APP_VERSION}</p>
        <h1 className="mt-3 text-3xl font-bold">{t("changelog.title")}</h1>
        <div className="mt-9 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {CHANGELOG.map((release) => <article key={release.version} className="py-8"><div className="flex items-baseline justify-between gap-4"><h2 className="text-xl font-bold">v{release.version}</h2><time className="text-sm text-[var(--muted)]" dateTime={release.date}>{release.date}</time></div>{release.categories.map((category) => <section key={category.name} className="mt-6"><h3 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-[var(--emerald)]" aria-hidden />{category.name}</h3><ul className="mt-3 grid gap-3">{category.entries.map((entry) => <li key={entry} className="flex gap-3 text-sm leading-6 text-[var(--muted)]"><Check className="mt-1 h-4 w-4 shrink-0 text-[var(--coral)]" aria-hidden />{entry}</li>)}</ul></section>)}</article>)}
        </div>
        <Link href="/auth/login" className="mt-8 inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--emerald-dark)]"><ArrowLeft className="h-4 w-4" aria-hidden />{t("changelog.back")}</Link>
      </div>
    </main>
  );
}
