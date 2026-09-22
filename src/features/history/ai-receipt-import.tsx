"use client";

import { initialAiReceiptResult, initialAiReviewDecisionResult } from "@/lib/actions/types";
import { Check, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import type { ReceiptReview } from "@/lib/ai/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { extractReceiptAction, recordAiReviewDecisionAction } from "./ai-actions";

type Decision = "accepted" | "rejected";

function normalizedPurchaseDate(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function ReviewDecisionForm({ cartId, receiptId, review, decisions, isReceiptImport }: { cartId: string; receiptId: string; review: ReceiptReview; decisions: Record<number, Decision>; isReceiptImport: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(recordAiReviewDecisionAction, initialAiReviewDecisionResult);
  const mutationId = useMutationId(state);
  const submitted = review.items.flatMap((item, itemIndex) => {
    const decision = decisions[itemIndex];
    return decision ? [{ itemIndex, decision, matchedCartItemId: item.matchedCartItemId }] : [];
  });
  const complete = submitted.length === review.items.length;
  const acceptedItems = review.items.filter((_, itemIndex) => decisions[itemIndex] === "accepted").map(({ name, barcode, quantity, unitPrice, lineTotal }) => ({ name, barcode, quantity, unitPrice, lineTotal }));
  const importData = {
    merchant: review.merchant,
    purchasedAt: normalizedPurchaseDate(review.purchasedAt),
    items: acceptedItems,
    accepted: acceptedItems.length,
    rejected: review.items.length - acceptedItems.length,
  };
  const errorKey = !state.success && state.errorCode !== "IDLE"
    ? (`errors.${state.errorCode}` in dictionaries.en ? `errors.${state.errorCode}` as TranslationKey : "errors.UNKNOWN")
    : null;
  const acceptedCount = acceptedItems.length;
  const rejectedCount = submitted.filter((item) => item.decision === "rejected").length;
  useEffect(() => {
    if (state.success && isReceiptImport) router.refresh();
  }, [isReceiptImport, router, state]);
  return (
    <form action={action} className="grid gap-3 border-t border-[var(--line)] pt-4">
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="receiptId" value={receiptId} />
      <input type="hidden" name="requestId" value={review.requestId} />
      <input type="hidden" name="mutationId" value={mutationId} />
      <input type="hidden" name="lineCount" value={review.items.length} />
      <input type="hidden" name="decisions" value={JSON.stringify(submitted)} />
      <input type="hidden" name="receiptImport" value={isReceiptImport ? "true" : "false"} />
      {isReceiptImport ? <input type="hidden" name="importData" value={JSON.stringify(importData)} /> : null}
      <p className="text-sm font-semibold text-[var(--ink)]">{t("ai.reviewProgress", { accepted: acceptedCount, rejected: rejectedCount, total: review.items.length })}</p>
      {state.success ? <p role="status" className="text-sm font-semibold text-emerald-800">{t(isReceiptImport ? "ai.importSaved" : "ai.reviewSaved")}</p> : null}
      {errorKey ? <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(errorKey)}</p> : null}
      <SubmitButton disabled={!complete || state.success || (isReceiptImport && acceptedItems.length === 0)}><Check className="h-4 w-4" aria-hidden />{t(isReceiptImport ? "ai.saveImport" : "common.save")}</SubmitButton>
    </form>
  );
}

export function AiReceiptImport({ cartId, receiptId, isReceiptImport = false }: { cartId: string; receiptId: string; isReceiptImport?: boolean }) {
  const { t, locale } = useT();
  const [state, action] = useActionState(extractReceiptAction, initialAiReceiptResult);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const review = state.success ? state.data.review : null;
  const errorKey = !state.success && state.errorCode !== "IDLE"
    ? (`errors.${state.errorCode}` in dictionaries.en ? `errors.${state.errorCode}` as TranslationKey : "errors.UNKNOWN")
    : null;
  return (
    <details className="border-t border-[var(--line)] bg-white" open={isReceiptImport ? true : undefined}>
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
          <section aria-labelledby={`ai-review-${receiptId}`} className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={`ai-review-${receiptId}`} className="font-bold">{t("ai.review")}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("ai.reviewSummary", { count: review.items.length, total: review.total ? formatMoney(review.total, locale) : "?" })}</p>
              </div>
              <Button variant="secondary" size="compact" className="h-auto min-h-10 px-3 py-2 text-left text-xs sm:text-sm" onClick={() => setDecisions(Object.fromEntries(review.items.map((_, index) => [index, "accepted"])))}><Check className="h-4 w-4 shrink-0" aria-hidden />{t(isReceiptImport ? "ai.keepAll" : "ai.acceptAll")}</Button>
            </div>
            <p className="text-xs leading-5 text-[var(--muted)]">{t(isReceiptImport ? "ai.importReviewHelp" : "ai.proposalOnly")}</p>
            <ol className="grid gap-3">
              {review.items.map((item, index) => (
                <li key={`${item.name}-${index}`} className={cn("grid gap-3 border p-3", decisions[index] === "accepted" ? "border-[var(--emerald)] bg-emerald-50/60" : decisions[index] === "rejected" ? "border-red-200 bg-red-50/60" : "border-[var(--line)] bg-white")}>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-5">{item.name}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{t("ai.quantityPrice", { quantity: item.quantity, price: item.unitPrice ? formatMoney(item.unitPrice, locale) : "?" })}</p>
                      {item.barcode ? <p className="mt-1 text-[11px] text-gray-500">{t("shopping.barcode")}: {item.barcode}</p> : null}
                    </div>
                    <p className="text-base font-bold text-[var(--ink)] sm:text-right">{formatMoney(item.lineTotal, locale)}</p>
                  </div>
                  {item.flags.length ? <div className="flex flex-wrap gap-1.5">{item.flags.map((flag) => <Badge key={flag} tone={flag === "no_match" ? "warning" : "info"}>{t(flag === "no_match" ? "ai.noMatch" : flag === "price_differs" ? "ai.priceDiffers" : "ai.quantityDiffers")}</Badge>)}</div> : null}
                  <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={t("ai.item")}><Button size="compact" className="h-auto min-h-10 px-3 py-2 text-xs sm:text-sm" variant={decisions[index] === "accepted" ? "primary" : "secondary"} onClick={() => setDecisions((current) => ({ ...current, [index]: "accepted" }))}><Check className="h-4 w-4 shrink-0" aria-hidden />{t(isReceiptImport ? "ai.keepLine" : "ai.accept")}</Button><Button size="compact" className="h-auto min-h-10 px-3 py-2 text-xs sm:text-sm" variant={decisions[index] === "rejected" ? "danger" : "secondary"} onClick={() => setDecisions((current) => ({ ...current, [index]: "rejected" }))}><X className="h-4 w-4 shrink-0" aria-hidden />{t(isReceiptImport ? "ai.ignoreLine" : "ai.reject")}</Button></div>
                </li>
              ))}
            </ol>
            <ReviewDecisionForm key={review.requestId} cartId={cartId} receiptId={receiptId} review={review} decisions={decisions} isReceiptImport={isReceiptImport} />
          </section>
        ) : null}
      </div>
    </details>
  );
}
