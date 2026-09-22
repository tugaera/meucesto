import { ReceiptImportForm } from "@/features/history/receipt-import-form";
import { getServerEnvironment, hasAiProvider } from "@/lib/env/server";

export default function ReceiptImportPage() {
  return <ReceiptImportForm aiEnabled={hasAiProvider()} allowLibraryUploads={getServerEnvironment().RECEIPT_ALLOW_LIBRARY_UPLOADS} />;
}
