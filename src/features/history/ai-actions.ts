"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, FieldErrors } from "@/lib/actions/types";
import { extractReceipt } from "@/lib/ai";
import { matchReceiptProposal } from "@/lib/ai/matching";
import { AiProviderError, type ReceiptReview } from "@/lib/ai/types";
import { requireUser } from "@/lib/auth/guards";
import { getServerEnvironment } from "@/lib/env/server";
import { toErrorCode } from "@/lib/errors";
import { RECEIPT_MIME_TYPES, type ReceiptMimeType } from "@/lib/receipts/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { historyCartDetailSchema, historyCartItemsSchema, receiptMetadataListSchema } from "@/types/domain";

export type AiReceiptResult = ActionResult<{ review: ReceiptReview }>;
export type AiReviewDecisionResult = ActionResult<{ message: "AI_REVIEW_RECORDED" | "AI_RECEIPT_IMPORTED"; accepted: number; rejected: number }>;

export async function extractReceiptAction(_state: AiReceiptResult, formData: FormData): Promise<AiReceiptResult> {
  const parsed = z.object({ cartId: z.uuid(), receiptId: z.uuid(), consent: z.literal("on") }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, errorCode: "AI_CONSENT_REQUIRED", fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors };
  await requireUser();
  const environment = getServerEnvironment();
  if (!environment.ANTHROPIC_API_KEY && !environment.OPENAI_API_KEY) return { success: false, errorCode: "AI_UNAVAILABLE" };
  const supabase = await createClient();
  const [detailResult, receiptsResult, itemsResult] = await Promise.all([
    supabase.rpc("get_history_cart_detail", { cart_id: parsed.data.cartId }),
    supabase.rpc("get_history_cart_receipts", { cart_id: parsed.data.cartId }),
    supabase.rpc("get_history_cart_items", { cart_id: parsed.data.cartId }),
  ]);
  if (detailResult.error || receiptsResult.error || itemsResult.error || !historyCartDetailSchema.safeParse(detailResult.data).success) {
    return { success: false, errorCode: toErrorCode(detailResult.error ?? receiptsResult.error ?? itemsResult.error) };
  }
  const receipts = receiptMetadataListSchema.safeParse(receiptsResult.data);
  const items = historyCartItemsSchema.safeParse(itemsResult.data);
  if (!receipts.success || !items.success) return { success: false, errorCode: "UNKNOWN" };
  const receipt = receipts.data.find((item) => item.id === parsed.data.receiptId);
  if (!receipt || !RECEIPT_MIME_TYPES.includes(receipt.mimeType as ReceiptMimeType)) return { success: false, errorCode: "RESOURCE_NOT_FOUND" };
  const quota = await supabase.rpc("consume_ai_daily_quota", { daily_limit: environment.AI_OCR_DAILY_LIMIT });
  if (quota.error) return { success: false, errorCode: toErrorCode(quota.error) };
  const downloaded = await createAdminClient().storage.from("receipts").download(receipt.objectPath);
  if (downloaded.error || !downloaded.data) return { success: false, errorCode: "RESOURCE_NOT_FOUND" };
  try {
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const extraction = await extractReceipt({ bytes, mimeType: receipt.mimeType }, environment, async (status) => {
      const recorded = await supabase.rpc("record_ai_provider_request", {
        request_id: status.requestId,
        provider: status.provider,
        status: status.status,
        ...(status.providerRequestId ? { provider_request_id: status.providerRequestId } : {}),
        ...(status.errorCode ? { error_code: status.errorCode } : {}),
      });
      if (recorded.error) throw new Error(toErrorCode(recorded.error));
    });
    const review = matchReceiptProposal(extraction.result.proposal, items.data, extraction.provider, extraction.requestId);
    return { success: true, data: { review } };
  } catch (error) {
    return { success: false, errorCode: error instanceof AiProviderError ? error.errorCode : toErrorCode(error) };
  }
}

const decisionSchema = z.object({
  itemIndex: z.number().int().min(0).max(199),
  decision: z.enum(["accepted", "rejected"]),
  matchedCartItemId: z.uuid().nullable(),
}).strict();

const importLineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  barcode: z.string().max(80).nullable(),
  quantity: z.string().regex(/^\d+(?:\.\d{1,3})?$/),
  unitPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/).nullable(),
  lineTotal: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
}).strict();

const importDataSchema = z.object({
  merchant: z.string().trim().max(200).nullable(),
  purchasedAt: z.string().datetime().nullable(),
  items: z.array(importLineSchema).min(1).max(200),
  accepted: z.number().int().positive().max(200),
  rejected: z.number().int().nonnegative().max(200),
}).strict();

export async function recordAiReviewDecisionAction(_state: AiReviewDecisionResult, formData: FormData): Promise<AiReviewDecisionResult> {
  const parsed = z.object({
    cartId: z.uuid(),
    receiptId: z.uuid(),
    requestId: z.uuid(),
    mutationId: z.uuid(),
    lineCount: z.coerce.number().int().min(0).max(200),
    decisions: z.string().max(40_000),
    receiptImport: z.enum(["true", "false"]).default("false"),
    importData: z.string().max(100_000).optional(),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, errorCode: "VALIDATION_ERROR", fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors };
  let decoded: unknown;
  try {
    decoded = JSON.parse(parsed.data.decisions);
  } catch {
    return { success: false, errorCode: "VALIDATION_ERROR" };
  }
  const decisions = z.array(decisionSchema).max(200).safeParse(decoded);
  if (!decisions.success
    || decisions.data.length !== parsed.data.lineCount
    || new Set(decisions.data.map((decision) => decision.itemIndex)).size !== parsed.data.lineCount
    || decisions.data.some((decision) => decision.itemIndex >= parsed.data.lineCount)) {
    return { success: false, errorCode: "VALIDATION_ERROR" };
  }
  await requireUser();
  const supabase = await createClient();
  let result;
  if (parsed.data.receiptImport === "true") {
    let decodedImport: unknown;
    try {
      decodedImport = JSON.parse(parsed.data.importData ?? "");
    } catch {
      return { success: false, errorCode: "VALIDATION_ERROR" };
    }
    const importData = importDataSchema.safeParse(decodedImport);
    if (!importData.success
      || importData.data.accepted + importData.data.rejected !== parsed.data.lineCount
      || importData.data.accepted !== decisions.data.filter((decision) => decision.decision === "accepted").length) {
      return { success: false, errorCode: "VALIDATION_ERROR" };
    }
    result = await supabase.rpc("apply_ai_receipt_import", {
      cart_id: parsed.data.cartId,
      receipt_id: parsed.data.receiptId,
      review_request_id: parsed.data.requestId,
      import_data: importData.data as Json,
      mutation_id: parsed.data.mutationId,
    });
  } else {
    result = await supabase.rpc("record_ai_receipt_review", {
      cart_id: parsed.data.cartId,
      receipt_id: parsed.data.receiptId,
      review_request_id: parsed.data.requestId,
      decisions: decisions.data,
      mutation_id: parsed.data.mutationId,
    });
  }
  if (result.error) return { success: false, errorCode: toErrorCode(result.error) };
  const response = z.object({ accepted: z.number().int().nonnegative(), rejected: z.number().int().nonnegative() }).safeParse(result.data);
  if (!response.success) return { success: false, errorCode: "UNKNOWN" };
  if (parsed.data.receiptImport === "true") {
    revalidatePath(`/history/${parsed.data.cartId}`);
    revalidatePath("/history");
  }
  return { success: true, data: { message: parsed.data.receiptImport === "true" ? "AI_RECEIPT_IMPORTED" : "AI_REVIEW_RECORDED", ...response.data } };
}
