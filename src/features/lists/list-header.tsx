"use client";

import Link from "next/link";
import { ArrowLeft, ShoppingBasket, Trash2, UserMinus } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { ListDetail } from "@/types/domain";
import { deleteListAction, initialListMutationResult, leaveListAction, renameListAction } from "./actions";
import { ListMutationFeedback } from "./mutation-feedback";

export function ListHeader({ list }: { list: ListDetail }) {
  const { t } = useT();
  const [renameState, renameAction] = useActionState(renameListAction, initialListMutationResult);
  const [deleteState, deleteAction] = useActionState(deleteListAction, initialListMutationResult);
  const [leaveState, leaveAction] = useActionState(leaveListAction, initialListMutationResult);
  const [mutationIds] = useState(() => ({ rename: crypto.randomUUID(), delete: crypto.randomUUID(), leave: crypto.randomUUID() }));
  return (
    <header className="grid gap-4 border-b border-[var(--line)] pb-5">
      <Link href="/lists" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-[var(--muted)]"><ArrowLeft className="h-4 w-4" aria-hidden />{t("common.back")}</Link>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h1 className="break-words text-2xl font-bold">{list.name}</h1>{list.isShared ? <p className="mt-1 text-sm text-[var(--muted)]">{t("lists.owner", { email: list.ownerEmail })}</p> : null}</div><Link href={`/shopping?list=${list.id}`} className={cn(buttonVariants({ variant: "secondary", size: "icon" }))} title={t("lists.track")} aria-label={t("lists.track")}><ShoppingBasket className="h-5 w-5" aria-hidden /></Link></div>
      {list.isOwner ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--emerald-dark)]">{t("lists.rename")}</summary><form action={renameAction} className="flex gap-2"><input type="hidden" name="listId" value={list.id} /><input type="hidden" name="revision" value={list.revision} /><input type="hidden" name="mutationId" value={mutationIds.rename} /><Input name="name" defaultValue={list.name} required /><Button type="submit">{t("common.save")}</Button></form><ListMutationFeedback result={renameState} /></details> : null}
      <div className="flex flex-wrap gap-2">{list.isOwner ? <form action={deleteAction}><input type="hidden" name="listId" value={list.id} /><input type="hidden" name="mutationId" value={mutationIds.delete} /><ConfirmButton type="submit" variant="quiet" className="text-[var(--danger)]" confirmMessage={t("common.confirm")}><Trash2 className="h-4 w-4" aria-hidden />{t("lists.delete")}</ConfirmButton></form> : <form action={leaveAction}><input type="hidden" name="listId" value={list.id} /><input type="hidden" name="mutationId" value={mutationIds.leave} /><ConfirmButton type="submit" variant="quiet" className="text-[var(--danger)]" confirmMessage={t("common.confirm")}><UserMinus className="h-4 w-4" aria-hidden />{t("lists.leave")}</ConfirmButton></form>}</div>
      <ListMutationFeedback result={deleteState} /><ListMutationFeedback result={leaveState} />
    </header>
  );
}
