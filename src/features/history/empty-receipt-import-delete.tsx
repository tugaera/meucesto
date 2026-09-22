"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { dictionaries, type TranslationKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import { initialReceiptMutationResult } from "@/lib/actions/types";
import { useMutationId } from "@/lib/actions/use-mutation-id";
import { deleteEmptyReceiptImportAction } from "./receipt-actions";

export function EmptyReceiptImportDelete({ cartId }: { cartId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [state, action] = useActionState(deleteEmptyReceiptImportAction, initialReceiptMutationResult);
  const mutationId = useMutationId(state);
  const errorKey = !state.success && state.errorCode !== "IDLE"
    ? (`errors.${state.errorCode}` in dictionaries.en ? `errors.${state.errorCode}` as TranslationKey : "errors.UNKNOWN")
    : null;
  useEffect(() => {
    if (state.success) router.replace("/history");
  }, [router, state]);
  return (
    <form action={action} className="grid justify-items-center gap-3 border-t border-[var(--line)] px-5 py-4 text-center">
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="mutationId" value={mutationId} />
      <p className="max-w-md text-xs leading-5 text-[var(--muted)]">{t("history.deleteEmptyImportHelp")}</p>
      {errorKey ? <p role="alert" className="border border-red-200 bg-[var(--coral-soft)] p-3 text-sm text-red-900">{t(errorKey)}</p> : null}
      <ConfirmButton type="submit" variant="danger" size="compact" confirmMessage={t("history.deleteEmptyImportConfirm")}>
        <Trash2 className="h-4 w-4" aria-hidden />
        {t("history.deleteEmptyImport")}
      </ConfirmButton>
    </form>
  );
}
