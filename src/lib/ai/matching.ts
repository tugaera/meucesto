import Decimal from "decimal.js";
import { normalizeBarcode } from "@/lib/barcode/normalize";
import type { HistoryCartItem } from "@/types/domain";
import { receiptReviewSchema, type AiProviderName, type ReceiptExtraction, type ReceiptReview } from "./types";

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT").trim().replace(/\s+/g, " ");
}

function equalDecimal(left: string, right: string): boolean {
  try {
    return new Decimal(left).eq(right);
  } catch {
    return false;
  }
}

export function matchReceiptProposal(
  proposal: ReceiptExtraction,
  cartItems: HistoryCartItem[],
  provider: AiProviderName,
  requestId: string,
): ReceiptReview {
  const review = {
    ...proposal,
    provider,
    requestId,
    items: proposal.items.map((line) => {
      const barcode = normalizeBarcode(line.barcode ?? "");
      const barcodeMatches = barcode ? cartItems.filter((item) => normalizeBarcode(item.barcode ?? "") === barcode) : [];
      const lineName = normalizeName(line.name);
      const nameMatches = cartItems.filter((item) => {
        const itemName = normalizeName(item.name);
        return itemName === lineName || itemName.includes(lineName) || lineName.includes(itemName);
      });
      const candidates = barcodeMatches.length ? barcodeMatches : nameMatches;
      const matched = candidates.length === 1 ? candidates[0] ?? null : null;
      const flags: Array<"no_match" | "price_differs" | "quantity_differs"> = [];
      if (!matched) flags.push("no_match");
      if (matched && line.unitPrice && !equalDecimal(line.unitPrice, matched.price)) flags.push("price_differs");
      if (matched && !equalDecimal(line.quantity, matched.quantity)) flags.push("quantity_differs");
      return {
        ...line,
        matchedCartItemId: matched?.id ?? null,
        candidateCartItemIds: candidates.map((item) => item.id),
        flags,
      };
    }),
  };
  return receiptReviewSchema.parse(review);
}
