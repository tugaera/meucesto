"use client";

import { initialListMutationResult } from "@/lib/actions/types";
import { Pencil, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { colorForUser } from "@/lib/user-colors";
import type { ListItem } from "@/types/domain";
import { deleteListItemAction, updateListItemAction } from "./actions";
import { ListMutationFeedback } from "./mutation-feedback";

export function ListItemRow({ listId, item }: { listId: string; item: ListItem }) {
  const { t, locale } = useT();
  const [updateState, updateAction] = useActionState(updateListItemAction, initialListMutationResult);
  const [deleteState, deleteAction] = useActionState(deleteListItemAction, initialListMutationResult);
  const [mutationIds] = useState(() => ({ update: crypto.randomUUID(), delete: crypto.randomUUID() }));
  const contributor = item.addedByEmail ?? "?";
  return <li className="border-b border-[var(--line)] px-4 py-4 last:border-0 sm:px-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: colorForUser(item.addedBy ?? contributor) }} title={contributor}>{contributor.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{item.name}</h3>{item.barcode ? <p className="font-mono text-[11px] text-gray-400">{item.barcode}</p> : null}</div><span className="text-sm font-bold">× {locale === "pt" ? item.quantity.replace(".", ",") : item.quantity}</span></div><details className="ml-12 mt-2"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--emerald-dark)]"><Pencil className="h-4 w-4" aria-hidden />{t("common.edit")}</summary><div className="grid gap-2 border-l-2 border-[var(--emerald-soft)] pl-4"><form action={updateAction} className="grid gap-2"><input type="hidden" name="listId" value={listId} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="itemRevision" value={item.revision} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="mutationId" value={mutationIds.update} /><Input name="name" defaultValue={item.name} required /><div className="grid grid-cols-2 gap-2"><Input name="barcode" defaultValue={item.barcode ?? ""} /><Input name="quantity" defaultValue={locale === "pt" ? item.quantity.replace(".", ",") : item.quantity} inputMode="decimal" required /></div><Button type="submit" className="justify-self-end">{t("common.save")}</Button></form><form action={deleteAction}><input type="hidden" name="listId" value={listId} /><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="itemRevision" value={item.revision} /><input type="hidden" name="mutationId" value={mutationIds.delete} /><ConfirmButton type="submit" variant="quiet" className="text-[var(--danger)]" confirmMessage={t("common.confirm")}><Trash2 className="h-4 w-4" aria-hidden />{t("common.remove")}</ConfirmButton></form><ListMutationFeedback result={updateState} /><ListMutationFeedback result={deleteState} /></div></details></li>;
}
