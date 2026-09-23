"use client";

import { ArrowLeft, FileImage, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeading, Surface } from "@/components/ui/surface";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { initialReceiptImportResult } from "@/lib/actions/types";
import { cn } from "@/lib/utils";
import { ReceiptFileInput } from "./receipt-file-input";
import { createReceiptImportAction } from "./receipt-actions";

export function ReceiptImportForm({ aiEnabled, allowLibraryUploads }: { aiEnabled: boolean; allowLibraryUploads: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(createReceiptImportAction, initialReceiptImportResult);
  const [ids] = useState(() => ({
    cart: crypto.randomUUID(),
    receipt: crypto.randomUUID(),
    cleanup: crypto.randomUUID(),
  }));
  useEffect(() => {
    if (state.success) router.replace(`/history/${state.data.cartId}?receiptImport=1`);
  }, [router, state]);
  const errorKey = !state.success && state.errorCode !== "IDLE"
    ? (`errors.${state.errorCode}` in dictionaries.en ? `errors.${state.errorCode}` as TranslationKey : "errors.UNKNOWN")
    : null;

  return (
    <div className="grid gap-6">
      <Link href="/history" className={cn(buttonVariants({ variant: "quiet", size: "compact" }), "w-fit px-0")}>
        <ArrowLeft className="h-4 w-4" aria-hidden />{t("common.back")}
      </Link>
      <PageHeading title={t("history.importTitle")} description={t("history.importSubtitle")} />
      <Surface className="grid gap-5 p-4 sm:p-6">
        <div className="flex items-start gap-3 border-b border-[var(--line)] pb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--line)] bg-gray-50 text-[var(--emerald-dark)]">
            <FileImage className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-bold">{t("history.importReceipt")}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("history.importHelp")}</p>
          </div>
        </div>
        {!aiEnabled ? <p role="status" className="border-l-4 border-[var(--coral)] bg-[var(--coral-soft)] px-4 py-3 text-sm">{t("ai.unavailable")}</p> : null}
        <form action={action} className="grid gap-4">
          <ReceiptFileInput id="history-import-receipt" label={t("history.receiptFile")} hint={t("history.importFileHint")} allowLibraryUploads={allowLibraryUploads} />
          <input type="hidden" name="cartMutationId" value={ids.cart} />
          <input type="hidden" name="receiptMutationId" value={ids.receipt} />
          <input type="hidden" name="cleanupMutationId" value={ids.cleanup} />
          {errorKey ? <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(errorKey)}</p> : null}
          <SubmitButton pendingLabel={t("history.importUploading")}>
            {aiEnabled ? <Sparkles className="h-4 w-4" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
            {t("history.importContinue")}
          </SubmitButton>
        </form>
      </Surface>
    </div>
  );
}
