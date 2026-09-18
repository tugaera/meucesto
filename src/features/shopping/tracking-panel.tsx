"use client";

import { initialCartMutationResult } from "@/lib/actions/types";
import { Check, ListChecks, Unlink, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import type { CartItem, ListDirectoryItem } from "@/types/domain";
import { attachTrackingListAction } from "./actions";
import { MutationFeedback } from "./mutation-feedback";
import { buildTrackingMatches, type AmbiguousTrackingMatch } from "./tracking-matching";

interface TrackingData {
  cartId: string; listId: string | null; revision: number;
  state: { manuallyChecked: string[]; suppressedAutoMatch: string[] };
  items: { id: string; productId: string | null; name: string; barcode: string | null; quantity: string; revision: number }[];
}

function AmbiguityDialog({
  ambiguity,
  items,
  initialSelected,
  onResolve,
  onDismiss,
}: {
  ambiguity: AmbiguousTrackingMatch;
  items: TrackingData["items"];
  initialSelected: string[];
  onResolve: (selectedIds: string[]) => void;
  onDismiss: () => void;
}) {
  const { t } = useT();
  const [selected, setSelected] = useState(initialSelected);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const dismiss = () => { dialogRef.current?.close(); onDismiss(); };
  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); dismiss(); }} className="m-auto w-[calc(100%-2rem)] max-w-md border border-[var(--line)] bg-white p-0 text-[var(--ink)] backdrop:bg-black/55" aria-labelledby="tracking-match-title">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4"><div><h2 id="tracking-match-title" className="font-bold">{t("shopping.trackingChooseTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("shopping.trackingChooseIntro", { name: ambiguity.cartItemName })}</p></div><Button type="button" variant="quiet" size="icon" aria-label={t("common.close")} onClick={dismiss}><X className="h-5 w-5" aria-hidden /></Button></header>
      <div className="grid gap-2 p-5">{ambiguity.candidateIds.map((id) => { const item = items.find((candidate) => candidate.id === id); if (!item) return null; return <label key={id} className="flex min-h-12 cursor-pointer items-center gap-3 border border-[var(--line)] px-3 text-sm font-semibold"><input type="checkbox" checked={selected.includes(id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))} className="h-5 w-5 accent-[var(--emerald)]" />{item.name}</label>; })}</div>
      <footer className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-4"><Button type="button" variant="secondary" onClick={dismiss}>{t("common.cancel")}</Button><Button type="button" onClick={() => { dialogRef.current?.close(); onResolve(selected); }}>{t("common.save")}</Button></footer>
    </dialog>
  );
}

export function TrackingPanel({ cartId, cartRevision, lists, cartItems, tracking }: { cartId: string; cartRevision: number; lists: ListDirectoryItem[]; cartItems: CartItem[]; tracking: TrackingData | null }) {
  const { t } = useT();
  const router = useRouter();
  const [attachState, attachAction] = useActionState(attachTrackingListAction, initialCartMutationResult);
  const [attachMutationId] = useState(() => crypto.randomUUID());
  const [state, setState] = useState(tracking?.state ?? { manuallyChecked: [], suppressedAutoMatch: [] });
  const [revision, setRevision] = useState(tracking?.revision ?? cartRevision);
  const [syncLabel, setSyncLabel] = useState<"current" | "pending" | "failed" | "conflict">("current");
  const [dismissedAmbiguities, setDismissedAmbiguities] = useState<string[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const matches = useMemo(() => buildTrackingMatches(tracking?.items ?? [], cartItems), [tracking?.items, cartItems]);
  const autoMatches = matches.automaticIds;
  const activeAmbiguity = matches.ambiguities.find((ambiguity) => (
    !dismissedAmbiguities.includes(ambiguity.cartItemId)
    && ambiguity.candidateIds.some((id) => !state.manuallyChecked.includes(id) && !state.suppressedAutoMatch.includes(id))
  ));
  const checked = (id: string) => state.manuallyChecked.includes(id) || autoMatches.has(id) && !state.suppressedAutoMatch.includes(id);
  const persist = (nextState: typeof state) => {
    if (timer.current) window.clearTimeout(timer.current);
    setSyncLabel("pending");
    timer.current = window.setTimeout(async () => {
      const { data, error } = await createClient().rpc("update_tracking_state", { cart_id: cartId, state: nextState, expected_revision: revision, mutation_id: crypto.randomUUID() });
      if (error) { const conflict = error.message.includes("REVISION_CONFLICT"); setSyncLabel(conflict ? "conflict" : "failed"); if (conflict) router.refresh(); return; }
      if (typeof data === "object" && data !== null && "revision" in data && typeof data.revision === "number") setRevision(data.revision);
      setSyncLabel("current"); router.refresh();
    }, 500);
  };
  const toggle = (id: string) => {
    const isChecked = checked(id); const auto = autoMatches.has(id);
    const next = {
      manuallyChecked: isChecked ? state.manuallyChecked.filter((value) => value !== id) : [...new Set([...state.manuallyChecked, id])],
      suppressedAutoMatch: isChecked && auto ? [...new Set([...state.suppressedAutoMatch, id])] : state.suppressedAutoMatch.filter((value) => value !== id),
    };
    setState(next); persist(next);
  };
  const done = tracking?.items.filter((item) => checked(item.id)).length ?? 0;
  const resolveAmbiguity = (selectedIds: string[]) => {
    if (!activeAmbiguity) return;
    const selected = new Set(selectedIds);
    const candidates = new Set(activeAmbiguity.candidateIds);
    const next = {
      manuallyChecked: [...new Set([
        ...state.manuallyChecked.filter((id) => !candidates.has(id)),
        ...activeAmbiguity.candidateIds.filter((id) => selected.has(id)),
      ])],
      suppressedAutoMatch: [...new Set([
        ...state.suppressedAutoMatch.filter((id) => !candidates.has(id)),
        ...activeAmbiguity.candidateIds.filter((id) => !selected.has(id)),
      ])],
    };
    setState(next);
    persist(next);
  };
  return (
    <><details open={Boolean(tracking)} className="border border-emerald-200 bg-[var(--emerald-soft)]">
      <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-4 font-bold text-emerald-950"><ListChecks className="h-5 w-5" aria-hidden />{t("shopping.tracking")}{tracking ? <span className="ml-auto text-xs">{t("shopping.trackingProgress", { done, total: tracking.items.length })}</span> : null}</summary>
      <div className="border-t border-emerald-200 p-4">
        <form action={attachAction} className="flex gap-2"><input type="hidden" name="cartId" value={cartId} /><input type="hidden" name="revision" value={cartRevision} /><input type="hidden" name="mutationId" value={attachMutationId} /><Select name="listId" defaultValue={tracking?.listId ?? ""} aria-label={t("shopping.attachList")}><option value="">{t("common.none")}</option>{lists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</Select><Button type="submit" size="icon" aria-label={t("common.save")}><Check className="h-4 w-4" aria-hidden /></Button></form><MutationFeedback result={attachState} />
        {tracking ? <><ul className="mt-4 divide-y divide-emerald-200 border-y border-emerald-200">{tracking.items.map((item) => <li key={item.id}><label className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-sm"><input type="checkbox" checked={checked(item.id)} onChange={() => toggle(item.id)} className="h-5 w-5 accent-[var(--emerald)]" /><span className={checked(item.id) ? "line-through opacity-60" : ""}>{item.name}</span><span className="ml-auto text-xs text-[var(--muted)]">× {item.quantity}</span></label></li>)}</ul><p role="status" aria-live="polite" className="mt-3 text-xs font-semibold text-emerald-900">{t(`sync.${syncLabel}`)}</p></> : <p className="mt-3 flex items-center gap-2 text-sm text-emerald-900"><Unlink className="h-4 w-4" aria-hidden />{t("shopping.attachList")}</p>}
      </div>
    </details>
    {activeAmbiguity && tracking ? <AmbiguityDialog key={activeAmbiguity.cartItemId} ambiguity={activeAmbiguity} items={tracking.items} initialSelected={activeAmbiguity.candidateIds.filter((id) => state.manuallyChecked.includes(id))} onResolve={resolveAmbiguity} onDismiss={() => setDismissedAmbiguities((current) => [...current, activeAmbiguity.cartItemId])} /> : null}</>
  );
}
