"use client";

import { ListChecks } from "lucide-react";
import { EmptyState, Surface } from "@/components/ui/surface";
import { RealtimeController } from "@/lib/realtime/controller";
import { useT } from "@/i18n/provider";
import type { ListDetail, ListItem } from "@/types/domain";
import type { ListMember } from "./data";
import { ListAddItem } from "./list-add-item";
import { ListHeader } from "./list-header";
import { ListItemRow } from "./list-item-row";
import { ListSharePanel } from "./list-share-panel";

export function ListWorkspace({ list, items, members }: { list: ListDetail; items: ListItem[]; members: ListMember[] }) {
  const { t } = useT();
  return <div className="grid gap-6"><RealtimeController resourceType="list" resourceId={list.id} revision={list.revision} /><ListHeader key={list.revision} list={list} />{list.isShared ? <div className="border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm"><strong>{t("lists.owner", { email: list.ownerEmail })}</strong></div> : null}<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,36rem)_minmax(260px,1fr)]"><Surface>{items.length ? <ul>{items.map((item) => <ListItemRow key={`${item.id}:${item.revision}`} listId={list.id} item={item} />)}</ul> : <EmptyState icon={<ListChecks className="h-5 w-5" aria-hidden />} title={t("lists.emptyItems")} />}<div className="border-t border-[var(--line)]"><ListAddItem key={list.revision} listId={list.id} revision={list.revision} /></div></Surface>{list.isOwner ? <ListSharePanel key={list.revision} listId={list.id} members={members} /> : null}</div></div>;
}
