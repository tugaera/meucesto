"use client";

import { initialReceiptMutationResult, initialSignedReceiptResult } from "@/lib/actions/types";
import { ArrowDown, ArrowUp, Eye, FileImage, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import { cn } from "@/lib/utils";
import type { ReceiptMetadata } from "@/types/domain";
import { AiReceiptImport } from "./ai-receipt-import";
import {
  deleteReceiptAction, getReceiptSignedUrlsAction, reorderReceiptsAction, uploadReceiptAction, type ReceiptMutationResult } from "./receipt-actions";

function ReceiptFeedback({ result }: { result: ReceiptMutationResult }) {
  const { t } = useT();
  if (!result.success && result.errorCode === "IDLE") return null;
  if (result.success) return <p role="status" className="text-sm font-semibold text-emerald-800">{t("history.uploaded")}</p>;
  const candidate = `errors.${result.errorCode}`;
  const key: TranslationKey = candidate in dictionaries.en ? candidate as TranslationKey : "errors.UNKNOWN";
  return <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(key)}</p>;
}

function ReceiptDelete({ cartId, receiptId }: { cartId: string; receiptId: string }) {
  const { t } = useT();
  const [state, action] = useActionState(deleteReceiptAction, initialReceiptMutationResult);
  const mutationId = useMutationId(state);
  return (
    <form action={action}>
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="receiptId" value={receiptId} />
      <input type="hidden" name="mutationId" value={mutationId} />
      <ConfirmButton type="submit" variant="quiet" size="icon" className="text-[var(--danger)]" title={t("history.deleteReceipt")} aria-label={t("history.deleteReceipt")} confirmMessage={t("common.confirm")}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton>
      <ReceiptFeedback result={state} />
    </form>
  );
}

function ReceiptReorder({ cartId, orderedIds, direction }: { cartId: string; orderedIds: string[] | null; direction: "earlier" | "later" }) {
  const { t } = useT();
  const [mutationId] = useState(() => crypto.randomUUID());
  const Icon = direction === "earlier" ? ArrowUp : ArrowDown;
  const label = t(direction === "earlier" ? "history.moveEarlier" : "history.moveLater");
  return (
    <form action={reorderReceiptsAction}>
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="orderedIds" value={JSON.stringify(orderedIds ?? [])} />
      <input type="hidden" name="mutationId" value={mutationId} />
      <Button type="submit" variant="quiet" size="icon" disabled={!orderedIds} title={label} aria-label={label}><Icon className="h-4 w-4" aria-hidden /></Button>
    </form>
  );
}

export function ReceiptPanel({ cartId, receipts, canManage, aiEnabled, isReceiptImport = false, receiptImportCompleted = false }: { cartId: string; receipts: ReceiptMetadata[]; canManage: boolean; aiEnabled: boolean; isReceiptImport?: boolean; receiptImportCompleted?: boolean }) {
  const { t, locale } = useT();
  const [uploadState, uploadAction] = useActionState(uploadReceiptAction, initialReceiptMutationResult);
  const [signedState, signedAction] = useActionState(getReceiptSignedUrlsAction, initialSignedReceiptResult);
  const uploadMutationId = useMutationId(uploadState);
  const signedById = new Map(signedState.success ? signedState.data.receipts.map((receipt) => [receipt.id, receipt]) : []);
  const expiry = signedState.success ? signedState.data.receipts[0]?.expiresAt : null;
  return (
    <section aria-labelledby="receipts-heading" className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="receipts-heading" className="flex items-center gap-2 text-lg font-bold"><FileImage className="h-5 w-5" aria-hidden />{t("history.receipts")}</h2>
        {receipts.length ? <form action={signedAction}><input type="hidden" name="cartId" value={cartId} /><SubmitButton variant="secondary"><Eye className="h-4 w-4" aria-hidden />{t("history.viewReceipts")}</SubmitButton></form> : null}
      </div>
      {!canManage ? <p className="border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm">{t("history.sharedAccess")}</p> : null}
      {signedState.success && expiry ? <p className="text-xs text-[var(--muted)]">{t("history.signedExpiry", { time: new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", { timeStyle: "short" }).format(new Date(expiry)) })}</p> : null}
      {!signedState.success && signedState.errorCode !== "IDLE" ? <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t("errors.UNKNOWN")}</p> : null}
      {receipts.length ? (
        <ol className={cn("grid gap-4", isReceiptImport && !receiptImportCompleted ? "grid-cols-1" : "sm:grid-cols-2")}>
          {receipts.map((receipt, index) => {
            const signed = signedById.get(receipt.id);
            const previous = receipts[index - 1];
            const next = receipts[index + 1];
            const earlier = previous ? [...receipts.map((item) => item.id).slice(0, index - 1), receipt.id, previous.id, ...receipts.map((item) => item.id).slice(index + 1)] : null;
            const later = next ? [...receipts.map((item) => item.id).slice(0, index), next.id, receipt.id, ...receipts.map((item) => item.id).slice(index + 2)] : null;
            return (
              <li key={receipt.id} className="border border-[var(--line)] bg-gray-50">
                {aiEnabled && !receiptImportCompleted && isReceiptImport ? <AiReceiptImport cartId={cartId} receiptId={receipt.id} isReceiptImport /> : null}
                <div className={cn("flex items-center justify-center overflow-hidden bg-gray-100", isReceiptImport && !receiptImportCompleted ? "aspect-[16/10]" : "aspect-[4/5]")}>
                  {signed ? <Image src={signed.url} width={receipt.width ?? 1200} height={receipt.height ?? 1500} unoptimized alt={t("history.receiptAlt", { number: index + 1 })} className="h-full w-full object-contain" /> : <FileImage className="h-10 w-10 text-gray-400" aria-hidden />}
                </div>
                {canManage ? <div className="flex items-center justify-end border-t border-[var(--line)] bg-white p-1">
                  <ReceiptReorder key={`${receipt.id}:earlier:${earlier?.join(":") ?? ""}`} cartId={cartId} orderedIds={earlier} direction="earlier" />
                  <ReceiptReorder key={`${receipt.id}:later:${later?.join(":") ?? ""}`} cartId={cartId} orderedIds={later} direction="later" />
                  <ReceiptDelete cartId={cartId} receiptId={receipt.id} />
                </div> : null}
                {aiEnabled && !receiptImportCompleted && !isReceiptImport ? <AiReceiptImport cartId={cartId} receiptId={receipt.id} isReceiptImport={isReceiptImport} /> : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="py-6 text-center text-sm text-[var(--muted)]">{t("history.noReceipts")}</p>}
      {!aiEnabled && receipts.length ? <p className="text-xs text-[var(--muted)]">{t("ai.unavailable")}</p> : null}
      {canManage ? (
        <form action={uploadAction} className="grid gap-3 border-t border-[var(--line)] pt-5">
          <Field label={t("history.receiptFile")} htmlFor="receipt-file">
            <Input id="receipt-file" name="receipt" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="py-2" />
          </Field>
          <input type="hidden" name="cartId" value={cartId} />
          <input type="hidden" name="mutationId" value={uploadMutationId} />
          <ReceiptFeedback result={uploadState} />
          <SubmitButton><Upload className="h-4 w-4" aria-hidden />{t("history.uploadReceipt")}</SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
