"use client";

import { initialListMutationResult } from "@/lib/actions/types";
import Link from "next/link";
import { ArrowRight, ListChecks, Plus, Users } from "lucide-react";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, PageHeading, Surface } from "@/components/ui/surface";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import type { ListDirectoryItem } from "@/types/domain";
import { createListAction } from "./actions";
import { ListMutationFeedback } from "./mutation-feedback";

export function ListsDirectory({ lists }: { lists: ListDirectoryItem[] }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(createListAction, initialListMutationResult);
  const mutationId = useMutationId(state);
  return (
    <div className="grid gap-6">
      <PageHeading title={t("lists.title")} description={t("lists.subtitle")} />
      <Surface className="p-4 sm:p-5"><form action={action} className="flex gap-2"><Input name="name" aria-label={t("common.name")} placeholder={t("lists.new")} maxLength={160} required /><input type="hidden" name="mutationId" value={mutationId} /><Button type="submit" size="icon" aria-label={t("common.create")}><Plus className="h-5 w-5" aria-hidden /></Button></form><div className="mt-2"><ListMutationFeedback result={state} /></div></Surface>
      <Surface>{lists.length ? <ul className="divide-y divide-[var(--line)]">{lists.map((list) => <li key={list.id}><Link href={`/lists/${list.id}`} className="grid min-h-20 grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5"><span className="flex h-11 w-11 items-center justify-center bg-[var(--emerald-soft)] text-[var(--emerald-dark)]">{list.isShared ? <Users className="h-5 w-5" aria-hidden /> : <ListChecks className="h-5 w-5" aria-hidden />}</span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{list.name}</span><Badge tone={list.isShared ? "info" : "neutral"}>{t(list.isShared ? "lists.shared" : "lists.owned")}</Badge></span><span className="mt-1 block text-xs text-[var(--muted)]">{t("lists.items", { count: list.itemCount })} · {new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(list.updatedAt))}</span></span><ArrowRight className="h-5 w-5 text-[var(--muted)]" aria-hidden /></Link></li>)}</ul> : <EmptyState icon={<ListChecks className="h-5 w-5" aria-hidden />} title={t("lists.empty")} />}</Surface>
    </div>
  );
}
