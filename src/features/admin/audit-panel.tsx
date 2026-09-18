"use client";

import { Activity } from "lucide-react";
import { useT } from "@/i18n/provider";
import type { AdminCursor, AuditEvent } from "./data";
import { AdminPagination } from "./pagination";

export function AuditPanel({ events, nextCursor, cursorActive }: { events: AuditEvent[]; nextCursor: AdminCursor | null; cursorActive: boolean }) {
  const { t, locale } = useT();
  return <>{events.length ? <ol className="divide-y divide-[var(--line)]">{events.map((event) => <li key={event.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center bg-gray-100 text-[var(--muted)]"><Activity className="h-4 w-4" aria-hidden /></span><div className="min-w-0"><p className="break-words text-sm font-semibold">{event.action}</p><p className="mt-1 text-xs text-[var(--muted)]">{event.entityType ?? t("common.none")} · {new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</p><p className="mt-1 text-xs text-[var(--muted)]">{event.actor ? t("admin.eventActor", { email: event.actor.email }) : t("admin.systemActor")}</p></div></li>)}</ol> : <p className="text-sm text-[var(--muted)]">{t("admin.noAudit")}</p>}<AdminPagination kind="audit" section="audit" cursor={nextCursor} cursorActive={cursorActive} /></>;
}
