"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { AdminCursor } from "./data";

type CursorKind = "users" | "invites" | "audit";

export function AdminPagination({ kind, section, cursor, cursorActive }: { kind: CursorKind; section: string; cursor: AdminCursor | null; cursorActive: boolean }) {
  const { t } = useT();
  const nextParameters = new URLSearchParams({ section });
  if (cursor) {
    nextParameters.set(`${kind}At`, cursor.createdAt);
    nextParameters.set(`${kind}Id`, cursor.id);
  }
  return (
    <nav aria-label={t("common.next")} className="mt-4 flex items-center justify-center gap-2">
      {cursorActive ? <Link href={`/admin?section=${encodeURIComponent(section)}`} className={cn(buttonVariants({ variant: "quiet", size: "compact" }))}><ArrowLeft className="h-4 w-4" aria-hidden />{t("common.back")}</Link> : null}
      {cursor ? <Link href={`/admin?${nextParameters.toString()}`} className={cn(buttonVariants({ variant: "secondary", size: "compact" }))}>{t("common.next")}<ArrowRight className="h-4 w-4" aria-hidden /></Link> : null}
    </nav>
  );
}
