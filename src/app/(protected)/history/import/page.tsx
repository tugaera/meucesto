import { ReceiptImportForm } from "@/features/history/receipt-import-form";
import { hasAiProvider } from "@/lib/env/server";

export default function ReceiptImportPage() {
  return <ReceiptImportForm aiEnabled={hasAiProvider()} />;
}
