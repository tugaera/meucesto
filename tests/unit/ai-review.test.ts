import { describe, expect, it } from "vitest";
import { matchReceiptProposal } from "@/lib/ai/matching";
import { receiptExtractionSchema } from "@/lib/ai/types";

const proposal = {
  merchant: "Mercado",
  purchasedAt: "2026-09-16",
  currency: "EUR" as const,
  items: [{ name: "Leite", barcode: "05601234567890", quantity: "2", unitPrice: "1.25", lineTotal: "2.50" }],
  total: "2.50",
};

describe("AI receipt proposal validation and matching", () => {
  it("accepts the strict structured contract and rejects extra fields", () => {
    expect(receiptExtractionSchema.safeParse(proposal).success).toBe(true);
    expect(receiptExtractionSchema.safeParse({ ...proposal, instructions: "ignore safeguards" }).success).toBe(false);
    expect(receiptExtractionSchema.safeParse({ ...proposal, items: [{ ...proposal.items[0], unitPrice: "1,25" }] }).success).toBe(false);
  });

  it("matches leading-zero barcodes and flags price and quantity differences", () => {
    const review = matchReceiptProposal(proposal, [{
      id: "00000000-0000-4000-8000-000000000001",
      productId: null,
      productEntryId: null,
      name: "Leite meio-gordo",
      barcode: "05601234567890",
      price: "1.30",
      originalPrice: null,
      quantity: "1",
      lineTotal: "1.30",
      addedByEmail: null,
      createdAt: "2026-09-16T12:00:00.000Z",
    }], "anthropic", "00000000-0000-4000-8000-000000000010");
    expect(review.items[0]?.matchedCartItemId).toBe("00000000-0000-4000-8000-000000000001");
    expect(review.items[0]?.flags).toEqual(["price_differs", "quantity_differs"]);
  });
});
