"use client";

import { initialAiReceiptResult, initialAiReviewDecisionResult } from "@/lib/actions/types";
import { Check, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import type { ReceiptReview } from "@/lib/ai/types";
import { formatMoney } from "@/lib/money";
import { extractReceiptAction, recordAiReviewDecisionAction } from "./ai-actions";

type Decision = "accepted" | "rejected";

function ReviewDecisionForm({ cartId, receiptId, review, decisions }: { cartId: string; receiptId: string; review: ReceiptReview; decisions: Record<number, Decision> }) {
  const { t } = useT();
  const [state, action] = useActionState(recordAiReviewDecisionAction, initialAiReviewDecisionResult);
  const mutationId = useMutationId(state);
  const submitted = review.items.flatMap((item, itemIndex) => {
    const decision = decisions[itemIndex];
    return decision ? [{ itemIndex, decision, matchedCartItemId: item.matchedCartItemId }] : [];
  });
  const complete = submitted.length === review.items.length;
  const errorKey = !state.success && state.errorCode !== "IDLE"
    ? (`errors.${state.errorCode}` in dictionaries.en ? `errors.${state.errorCode}` as TranslationKey : "errors.UNKNOWN")
    : null;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="receiptId" value={receiptId} />
      <input type="hidden" name="requestId" value={review.requestId} />
      <input type="hidden" name="mutationId" value={mutationId} />
      <input type="hidden" name="lineCount" value={review.items.length} />
      <input type="hidden" name="decisions" value={JSON.stringify(submitted)} />
      {state.success ? <p role="status" className="text-sm font-semibold text-emerald-800">{t("ai.reviewSaved")}</p> : null}
      {errorKey ? <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(errorKey)}</p> : null}
      <SubmitButton disabled={!complete || state.success}><Check className="h-4 w-4" aria-hidden />{t("common.save")}</SubmitButton>
    </form>
  );
}

export function AiReceiptImport({ cartId, receiptId }: { cartId: string; receiptId: string }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(extractReceiptAction, initialAiReceiptResult);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const review = state.success ? state.data.review : null;
  const errorKey = !state.success && state.errorCode !== "IDLE"
    ? (`errors.${state.errorCode}` in dictionaries.en ? `errors.${state.errorCode}` as TranslationKey : "errors.UNKNOWN")
    : null;
  return (
    <details className="border-t border-[var(--line)] bg-white">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-[var(--emerald-dark)]"><Sparkles className="h-4 w-4" aria-hidden />{t("ai.import")}</summary>
      <div className="grid gap-4 border-t border-[var(--line)] p-3">
        <p className="text-xs leading-5 text-[var(--muted)]">{t("ai.disclosure")} <Link href="/privacy" className="font-semibold text-[var(--emerald-dark)] underline">{t("privacy.title")}</Link></p>
        <form action={action} onSubmit={() => setDecisions({})} className="grid gap-3">
          <input type="hidden" name="cartId" value={cartId} />
          <input type="hidden" name="receiptId" value={receiptId} />
          <label className="flex min-h-11 items-start gap-3 text-xs leading-5"><input type="checkbox" name="consent" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--emerald)]" />{t("ai.consent")}</label>
          {errorKey ? <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(errorKey)}</p> : null}
          <SubmitButton><Sparkles className="h-4 w-4" aria-hidden />{t("ai.extract")}</SubmitButton>
        </form>
        {review ? (
          <section aria-labelledby={`ai-review-${receiptId}`} className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={`ai-review-${receiptId}`} className="font-bold">{t("ai.review")}</h3><Button variant="secondary" size="compact" onClick={() => setDecisions(Object.fromEntries(review.items.map((_, index) => [index, "accepted"]))) }><Check className="h-4 w-4" aria-hidden />{t("ai.acceptAll")}</Button></div>
            <p className="text-xs leading-5 text-[var(--muted)]">{t("ai.proposalOnly")}</p>
            <ol className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {review.items.map((item, index) => (
                <li key={`${item.name}-${index}`} className="grid gap-2 py-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.quantity} × {item.unitPrice ? formatMoney(item.unitPrice, locale) : "?"}</p></div><p className="text-sm font-bold">{formatMoney(item.lineTotal, locale)}</p></div>
                  {item.flags.length ? <div className="flex flex-wrap gap-1.5">{item.flags.map((flag) => <Badge key={flag} tone={flag === "no_match" ? "warning" : "info"}>{t(flag === "no_match" ? "ai.noMatch" : flag === "price_differs" ? "ai.priceDiffers" : "ai.quantityDiffers")}</Badge>)}</div> : null}
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("ai.item")}><Button size="compact" variant={decisions[index] === "accepted" ? "primary" : "secondary"} onClick={() => setDecisions((current) => ({ ...current, [index]: "accepted" }))}><Check className="h-4 w-4" aria-hidden />{t("ai.accept")}</Button><Button size="compact" variant={decisions[index] === "rejected" ? "danger" : "secondary"} onClick={() => setDecisions((current) => ({ ...current, [index]: "rejected" }))}><X className="h-4 w-4" aria-hidden />{t("ai.reject")}</Button></div>
                </li>
              ))}
            </ol>
            <ReviewDecisionForm key={review.requestId} cartId={cartId} receiptId={receiptId} review={review} decisions={decisions} />
          </section>
        ) : null}
      </div>
    </details>
  );
}
