import { z } from "zod";

const decimalText = z.string().regex(/^\d+(?:\.\d{1,3})?$/);

export const receiptExtractionSchema = z.object({
  merchant: z.string().max(200).nullable(),
  purchasedAt: z.string().max(80).nullable(),
  currency: z.literal("EUR"),
  items: z.array(z.object({
    name: z.string().min(1).max(200),
    barcode: z.string().max(80).nullable(),
    quantity: decimalText,
    unitPrice: decimalText.nullable(),
    lineTotal: decimalText,
  }).strict()).max(200),
  total: decimalText.nullable(),
}).strict();

export const receiptReviewSchema = receiptExtractionSchema.extend({
  provider: z.enum(["anthropic", "openai"]),
  requestId: z.uuid(),
  items: z.array(z.object({
    name: z.string(),
    barcode: z.string().nullable(),
    quantity: decimalText,
    unitPrice: decimalText.nullable(),
    lineTotal: decimalText,
    matchedCartItemId: z.uuid().nullable(),
    candidateCartItemIds: z.array(z.uuid()),
    flags: z.array(z.enum(["no_match", "price_differs", "quantity_differs"])),
  }).strict()),
}).strict();

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;
export type ReceiptReview = z.infer<typeof receiptReviewSchema>;
export type AiProviderName = "anthropic" | "openai";
export type AiErrorClassification = "retriable" | "non_retriable" | "ambiguous" | "quota";

export class AiProviderError extends Error {
  constructor(
    public readonly provider: AiProviderName,
    public readonly classification: AiErrorClassification,
    public readonly errorCode: string,
  ) {
    super(errorCode);
    this.name = "AiProviderError";
  }
}

export interface ProviderExtractionResult {
  proposal: ReceiptExtraction;
  providerRequestId: string;
}
