"use client";

import { ArrowLeft, Link2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { initialJoinResult, joinCartAction, joinListAction } from "./actions";

export function JoinPanel({ type, token, valid, ownerEmail, resourceName }: { type: "cart" | "list"; token: string; valid: boolean; ownerEmail?: string | undefined; resourceName?: string | undefined }) {
  const { t } = useT();
  const action = type === "cart" ? joinCartAction : joinListAction;
  const [state, formAction] = useActionState(action, initialJoinResult);
  const [mutationId] = useState(() => crypto.randomUUID());
  const errorCandidate = !state.success && state.errorCode !== "IDLE" ? `errors.${state.errorCode}` : null;
  const errorKey: TranslationKey = errorCandidate && errorCandidate in dictionaries.en ? errorCandidate as TranslationKey : "errors.TOKEN_INVALID_OR_UNAVAILABLE";
  return <div className="mx-auto grid max-w-lg gap-6"><Link href={type === "cart" ? "/shopping" : "/lists"} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-[var(--muted)]"><ArrowLeft className="h-4 w-4" aria-hidden />{t("common.back")}</Link><Surface className="p-6 sm:p-8"><div className="flex h-12 w-12 items-center justify-center bg-[var(--emerald-soft)] text-[var(--emerald-dark)]"><Link2 className="h-6 w-6" aria-hidden /></div><h1 className="mt-5 text-2xl font-bold">{t(type === "cart" ? "join.cartTitle" : "join.listTitle")}</h1>{valid ? <><p className="mt-2 text-sm text-[var(--muted)]">{t("join.invitedBy", { email: ownerEmail ?? "" })}</p>{resourceName ? <p className="mt-4 border-y border-[var(--line)] py-4 font-semibold">{resourceName}</p> : null}<form action={formAction} className="mt-6"><input type="hidden" name="token" value={token} /><input type="hidden" name="mutationId" value={mutationId} /><Button type="submit" className="w-full">{t(type === "cart" ? "join.confirmCart" : "join.confirmList")}</Button></form></> : <p role="alert" className="mt-4 border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t("join.invalid")}</p>}{errorCandidate ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{t(errorKey)}</p> : null}</Surface></div>;
}
