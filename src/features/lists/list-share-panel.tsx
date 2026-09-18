"use client";

import { initialListMutationResult } from "@/lib/actions/types";
import { Copy, Link2, Share2, UserMinus } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import { getPublicEnvironment } from "@/lib/env/public";
import type { ListMember } from "./data";
import { revokeListShareAction, rotateListTokenAction, shareListAction } from "./actions";
import { ListMutationFeedback } from "./mutation-feedback";

function ListMemberRow({ listId, member }: { listId: string; member: ListMember }) {
  const { t } = useT();
  const [state, action] = useActionState(revokeListShareAction, initialListMutationResult);
  const mutationId = useMutationId(state);

  return (
    <li className="flex min-h-12 flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 flex-1 truncate text-sm">{member.email}</span>
      <form action={action}>
        <input type="hidden" name="listId" value={listId} />
        <input type="hidden" name="userId" value={member.userId} />
        <input type="hidden" name="mutationId" value={mutationId} />
        <ConfirmButton type="submit" variant="quiet" size="icon" aria-label={t("common.remove")} confirmMessage={t("common.confirm")}>
          <UserMinus className="h-4 w-4" aria-hidden />
        </ConfirmButton>
      </form>
      <div className="basis-full"><ListMutationFeedback result={state} /></div>
    </li>
  );
}

export function ListSharePanel({ listId, members }: { listId: string; members: ListMember[] }) {
  const { t } = useT();
  const [shareState, shareAction] = useActionState(shareListAction, initialListMutationResult);
  const [tokenState, tokenAction] = useActionState(rotateListTokenAction, initialListMutationResult);
  const [copied, setCopied] = useState(false);
  const shareMutationId = useMutationId(shareState);
  const tokenMutationId = useMutationId(tokenState);
  const token = tokenState.success && typeof tokenState.data.data === "object" && tokenState.data.data !== null && "token" in tokenState.data.data && typeof tokenState.data.data.token === "string" ? tokenState.data.data.token : null;
  const joinUrl = token ? `${getPublicEnvironment().NEXT_PUBLIC_SITE_URL}/lists/join/${token}` : null;
  return <details className="border border-[var(--line)] bg-white"><summary className="flex min-h-14 cursor-pointer items-center gap-3 px-4 font-bold"><Share2 className="h-5 w-5 text-[var(--emerald)]" aria-hidden />{t("lists.sharePanel")}</summary><div className="grid gap-5 border-t border-[var(--line)] p-4"><form action={shareAction} className="grid gap-2"><div className="flex gap-2"><Input name="email" type="email" aria-label={t("common.email")} placeholder={t("common.email")} required /><input type="hidden" name="listId" value={listId} /><input type="hidden" name="mutationId" value={shareMutationId} /><Button type="submit" size="icon" aria-label={t("common.share")}><Share2 className="h-4 w-4" aria-hidden /></Button></div><ListMutationFeedback result={shareState} /></form><section><h3 className="text-sm font-bold">{t("shopping.members")}</h3>{members.length ? <ul className="mt-2 divide-y divide-[var(--line)] border-y border-[var(--line)]">{members.map((member) => <ListMemberRow listId={listId} member={member} key={member.shareId} />)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">{t("shopping.noMembers")}</p>}</section><form action={tokenAction} className="flex gap-2"><Input name="maxUses" type="number" min="1" max="100" placeholder={t("shopping.maxUses")} /><input type="hidden" name="listId" value={listId} /><input type="hidden" name="mutationId" value={tokenMutationId} /><Button type="submit" variant="secondary"><Link2 className="h-4 w-4" aria-hidden />{t("shopping.rotateLink")}</Button></form>{joinUrl ? <div className="flex items-center gap-2 border border-emerald-200 bg-[var(--emerald-soft)] p-2"><code className="min-w-0 flex-1 truncate text-xs">{joinUrl}</code><Button variant="quiet" size="icon" aria-label={t("common.copy")} onClick={() => { void navigator.clipboard.writeText(joinUrl); setCopied(true); }}><Copy className="h-4 w-4" aria-hidden /></Button></div> : null}{copied ? <p role="status" className="text-xs text-emerald-800">{t("common.copy")}</p> : null}<ListMutationFeedback result={tokenState} /></div></details>;
}
