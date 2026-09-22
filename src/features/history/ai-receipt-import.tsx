"use client";

import { initialAiReceiptResult, initialAiReviewDecisionResult } from "@/lib/actions/types";
import { Check, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ProductEditor } from "@/features/products/product-editor";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import type { ReceiptReview } from "@/lib/ai/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ProductDetail, ReferenceData } from "@/types/domain";
import { extractReceiptAction, recordAiReviewDecisionAction } from "./ai-actions";

type Decision = "accepted" | "rejected";
type EditableReceiptLine = { name: string; barcode: string; quantity: string; unitPrice: string; lineTotal: string };

function normalizedPurchaseDate(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeMoneyInput(value: string): string {
  return value.trim().replace(",", ".");
}

function normalizeEditableLine(line: EditableReceiptLine) {
  return {
    name: line.name.trim(),
    barcode: line.barcode.trim() || null,
    quantity: normalizeMoneyInput(line.quantity),
    unitPrice: normalizeMoneyInput(line.unitPrice) || null,
    lineTotal: normalizeMoneyInput(line.lineTotal),
  };
}

function editableLinesFromReview(review: ReceiptReview): EditableReceiptLine[] {
  return review.items.map((item) => ({
    name: item.name,
    barcode: item.barcode ?? "",
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? "",
    lineTotal: item.lineTotal,
  }));
}

function decisionsFromReview(review: ReceiptReview, decision: Decision): Record<number, Decision> {
  return Object.fromEntries(review.items.map((_, index) => [index, decision]));
}

function ReviewDecisionForm({ cartId, receiptId, review, decisions, isReceiptImport, editableLines }: { cartId: string; receiptId: string; review: ReceiptReview; decisions: Record<number, Decision>; isReceiptImport: boolean; editableLines: EditableReceiptLine[] }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(recordAiReviewDecisionAction, initialAiReviewDecisionResult);
  const mutationId = useMutationId(state);
  const submitted = review.items.flatMap((item, itemIndex) => {
    const decision = decisions[itemIndex];
    return decision ? [{ itemIndex, decision, matchedCartItemId: item.matchedCartItemId }] : [];
  });
  const complete = submitted.length === review.items.length;
  const acceptedItems = review.items.flatMap((_, itemIndex) => {
    if (decisions[itemIndex] !== "accepted") return [];
    const line = editableLines[itemIndex];
    return line ? [normalizeEditableLine(line)] : [];
  });
  const acceptedValid = acceptedItems.every((item) => item.name && /^\d+(?:\.\d{1,3})?$/.test(item.quantity) && /^\d+(?:\.\d{1,2})?$/.test(item.lineTotal) && (item.unitPrice === null || /^\d+(?:\.\d{1,2})?$/.test(item.unitPrice)));
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
      <p className="text-sm font-semibold text-[var(--ink)]">{t("ai.reviewProgress", { accepted: acceptedItems.length, rejected: rejectedCount, total: review.items.length })}</p>
      {isReceiptImport && !acceptedValid ? <p role="alert" className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{t("ai.editInvalid")}</p> : null}
      {state.success ? <p role="status" className="text-sm font-semibold text-emerald-800">{t(isReceiptImport ? "ai.importSaved" : "ai.reviewSaved")}</p> : null}
      {errorKey ? <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(errorKey)}</p> : null}
      <SubmitButton disabled={!complete || state.success || (isReceiptImport && (acceptedItems.length === 0 || !acceptedValid))}><Check className="h-4 w-4" aria-hidden />{t(isReceiptImport ? "ai.saveImport" : "common.save")}</SubmitButton>
    </form>
  );
}

function ReceiptLineProductDialog({
  line,
  references,
  onProductSaved,
}: {
  line: EditableReceiptLine;
  references: ReferenceData;
  onProductSaved: (product: ProductDetail) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="compact" className="w-fit" onClick={() => setOpen(true)}>{t("ai.productDetails")}</Button>
      {open ? (
        <dialog open aria-labelledby="receipt-line-product-title" className="fixed inset-4 z-50 m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto border border-[var(--line)] bg-white p-0 text-[var(--ink)] shadow-xl backdrop:bg-black/55">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--line)] bg-white px-5 py-4">
            <div>
              <h2 id="receipt-line-product-title" className="text-lg font-bold">{t("ai.productDetails")}</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("ai.productDetailsHelp")}</p>
            </div>
            <Button variant="quiet" size="icon" onClick={() => setOpen(false)} aria-label={t("common.close")}><X className="h-5 w-5" aria-hidden /></Button>
          </header>
          <div className="p-5">
            <ProductEditor
              references={references}
              elevated={false}
              initialValues={{ name: line.name, barcode: line.barcode }}
              onClose={() => setOpen(false)}
              onProductSaved={(product) => {
                onProductSaved(product);
                setOpen(false);
              }}
            />
          </div>
        </dialog>
      ) : null}
    </>
  );
}

function ReceiptReviewEditor({ cartId, receiptId, review, isReceiptImport, references }: { cartId: string; receiptId: string; review: ReceiptReview; isReceiptImport: boolean; references: ReferenceData }) {
  const { t, locale } = useT();
  const [decisions, setDecisions] = useState<Record<number, Decision>>(() => decisionsFromReview(review, isReceiptImport ? "accepted" : "rejected"));
  const [editableLines, setEditableLines] = useState<EditableReceiptLine[]>(() => editableLinesFromReview(review));
  const [linkedProducts, setLinkedProducts] = useState<Record<number, ProductDetail>>({});
  const acceptedCount = Object.values(decisions).filter((decision) => decision === "accepted").length;
  const updateEditableLine = (index: number, patch: Partial<EditableReceiptLine>) => {
    setEditableLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  return (
    <section aria-labelledby={`ai-review-${receiptId}`} className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`ai-review-${receiptId}`} className="font-bold">{t("ai.review")}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("ai.reviewSummary", { count: review.items.length, total: review.total ? formatMoney(review.total, locale) : "?" })}</p>
        </div>
        {isReceiptImport ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="compact" className="h-auto min-h-10 px-3 py-2 text-left text-xs sm:text-sm" onClick={() => setDecisions(decisionsFromReview(review, "accepted"))}><Check className="h-4 w-4 shrink-0" aria-hidden />{t("ai.selectAll")}</Button>
            <Button variant="secondary" size="compact" className="h-auto min-h-10 px-3 py-2 text-left text-xs sm:text-sm" onClick={() => setDecisions(decisionsFromReview(review, "rejected"))}><X className="h-4 w-4 shrink-0" aria-hidden />{t("ai.selectNone")}</Button>
          </div>
        ) : (
          <Button variant="secondary" size="compact" className="h-auto min-h-10 px-3 py-2 text-left text-xs sm:text-sm" onClick={() => setDecisions(decisionsFromReview(review, "accepted"))}><Check className="h-4 w-4 shrink-0" aria-hidden />{t("ai.acceptAll")}</Button>
        )}
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">{t(isReceiptImport ? "ai.importReviewHelp" : "ai.proposalOnly")}</p>
      {isReceiptImport ? <p className="text-xs font-semibold text-[var(--ink)]">{t("ai.selectedLines", { count: acceptedCount, total: review.items.length })}</p> : null}
      <ol className="grid gap-3">
        {review.items.map((item, index) => {
          const editable = editableLines[index] ?? { name: item.name, barcode: item.barcode ?? "", quantity: item.quantity, unitPrice: item.unitPrice ?? "", lineTotal: item.lineTotal };
          const accepted = decisions[index] === "accepted";
          const linkedProduct = linkedProducts[index];
          return (
            <li key={`${item.name}-${index}`} className={cn("grid gap-3 border p-3", accepted ? "border-[var(--emerald)] bg-emerald-50/60" : decisions[index] === "rejected" ? "border-red-200 bg-red-50/60" : "border-[var(--line)] bg-white")}>
              {isReceiptImport ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex min-h-8 items-center gap-3 text-sm font-semibold">
                    <input type="checkbox" checked={accepted} onChange={(event) => setDecisions((current) => ({ ...current, [index]: event.target.checked ? "accepted" : "rejected" }))} className="h-5 w-5 shrink-0 accent-[var(--emerald)]" />
                    {accepted ? t("ai.keepLine") : t("ai.ignoreLine")}
                  </label>
                  <ReceiptLineProductDialog
                    line={editable}
                    references={references}
                    onProductSaved={(product) => {
                      updateEditableLine(index, { name: product.name, barcode: product.barcode ?? "" });
                      setLinkedProducts((current) => ({ ...current, [index]: product }));
                      setDecisions((current) => ({ ...current, [index]: "accepted" }));
                    }}
                  />
                </div>
              ) : null}
              <div className={cn("grid gap-3", isReceiptImport ? "sm:grid-cols-[minmax(0,1.35fr)_minmax(7rem,0.45fr)_minmax(7rem,0.45fr)_minmax(7rem,0.45fr)]" : "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start")}>
                {isReceiptImport ? (
                  <>
                    <Input aria-label={t("shopping.productName")} value={editable.name} onChange={(event) => updateEditableLine(index, { name: event.target.value })} className="min-h-10 text-sm font-semibold" />
                    <Input aria-label={t("shopping.quantity")} inputMode="decimal" value={editable.quantity} onChange={(event) => updateEditableLine(index, { quantity: event.target.value })} className="min-h-10 text-sm" />
                    <Input aria-label={t("shopping.price")} inputMode="decimal" value={editable.unitPrice} onChange={(event) => updateEditableLine(index, { unitPrice: event.target.value })} className="min-h-10 text-sm" />
                    <Input aria-label={t("shopping.total")} inputMode="decimal" value={editable.lineTotal} onChange={(event) => updateEditableLine(index, { lineTotal: event.target.value })} className="min-h-10 text-sm font-semibold" />
                  </>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-5">{item.name}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{t("ai.quantityPrice", { quantity: item.quantity, price: item.unitPrice ? formatMoney(item.unitPrice, locale) : "?" })}</p>
                      {item.barcode ? <p className="mt-1 text-[11px] text-gray-500">{t("shopping.barcode")}: {item.barcode}</p> : null}
                    </div>
                    <p className="text-base font-bold text-[var(--ink)] sm:text-right">{formatMoney(item.lineTotal, locale)}</p>
                  </>
                )}
              </div>
              {isReceiptImport ? <Input aria-label={t("shopping.barcode")} value={editable.barcode} onChange={(event) => updateEditableLine(index, { barcode: event.target.value })} className="min-h-10 text-sm" placeholder={t("shopping.barcode")} /> : null}
              <div className="flex flex-wrap gap-1.5">
                {linkedProduct ? <Badge tone="success">{t("ai.productLinked")}</Badge> : null}
                {item.flags.map((flag) => <Badge key={flag} tone={flag === "no_match" ? "warning" : "info"}>{t(flag === "no_match" ? (isReceiptImport ? "ai.newReceiptLine" : "ai.noMatch") : flag === "price_differs" ? "ai.priceDiffers" : "ai.quantityDiffers")}</Badge>)}
              </div>
              {!isReceiptImport ? <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={t("ai.item")}><Button size="compact" className="h-auto min-h-10 px-3 py-2 text-xs sm:text-sm" variant={accepted ? "primary" : "secondary"} onClick={() => setDecisions((current) => ({ ...current, [index]: "accepted" }))}><Check className="h-4 w-4 shrink-0" aria-hidden />{t("ai.accept")}</Button><Button size="compact" className="h-auto min-h-10 px-3 py-2 text-xs sm:text-sm" variant={decisions[index] === "rejected" ? "danger" : "secondary"} onClick={() => setDecisions((current) => ({ ...current, [index]: "rejected" }))}><X className="h-4 w-4 shrink-0" aria-hidden />{t("ai.reject")}</Button></div> : null}
            </li>
          );
        })}
      </ol>
      <ReviewDecisionForm cartId={cartId} receiptId={receiptId} review={review} decisions={decisions} isReceiptImport={isReceiptImport} editableLines={editableLines} />
    </section>
  );
}

export function AiReceiptImport({ cartId, receiptId, references, isReceiptImport = false }: { cartId: string; receiptId: string; references: ReferenceData; isReceiptImport?: boolean }) {
  const { t } = useT();
  const [state, action] = useActionState(extractReceiptAction, initialAiReceiptResult);
  const review = state.success ? state.data.review : null;
  const errorKey = !state.success && state.errorCode !== "IDLE"
    ? (`errors.${state.errorCode}` in dictionaries.en ? `errors.${state.errorCode}` as TranslationKey : "errors.UNKNOWN")
    : null;
  return (
    <details className="border-t border-[var(--line)] bg-white" open={isReceiptImport ? true : undefined}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-[var(--emerald-dark)]"><Sparkles className="h-4 w-4" aria-hidden />{t("ai.import")}</summary>
      <div className="grid gap-4 border-t border-[var(--line)] p-3">
        <p className="text-xs leading-5 text-[var(--muted)]">{t("ai.disclosure")} <Link href="/privacy" className="font-semibold text-[var(--emerald-dark)] underline">{t("privacy.title")}</Link></p>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="cartId" value={cartId} />
          <input type="hidden" name="receiptId" value={receiptId} />
          <label className="flex min-h-11 items-start gap-3 text-xs leading-5"><input type="checkbox" name="consent" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--emerald)]" />{t("ai.consent")}</label>
          {errorKey ? <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(errorKey)}</p> : null}
          <SubmitButton><Sparkles className="h-4 w-4" aria-hidden />{t("ai.extract")}</SubmitButton>
        </form>
        {review ? <ReceiptReviewEditor key={review.requestId} cartId={cartId} receiptId={receiptId} review={review} isReceiptImport={isReceiptImport} references={references} /> : null}
      </div>
    </details>
  );
}
