"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "@/i18n/provider";

export default function OfflinePage() {
  const { t } = useT();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <Image src="/assets/meu-cesto-mark.png" width={112} height={112} alt="" priority />
      <h1 className="mt-6 text-2xl font-bold">{t("offline.title")}</h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">
        {t("offline.body")}
      </p>
      <Link className="mt-7 inline-flex min-h-11 items-center border border-[var(--line)] bg-white px-4 font-semibold" href="/shopping">
        {t("common.retry")}
      </Link>
    </main>
  );
}
