"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, FieldErrors } from "@/lib/actions/types";
import { requireUser } from "@/lib/auth/guards";
import { getServerEnvironment } from "@/lib/env/server";
import { toErrorCode } from "@/lib/errors";
import { createReceiptObjectPath, processReceiptImage } from "@/lib/receipts/image-processing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { historyCartDetailSchema, historyCartItemsSchema, receiptMetadataListSchema } from "@/types/domain";

interface SignedReceipt {
  id: string;
  url: string;
  expiresAt: string;
}

export type ReceiptMutationResult = ActionResult<{ message: string }>;
export type ReceiptImportResult = ActionResult<{ cartId: string }>;
export type SignedReceiptResult = ActionResult<{ receipts: SignedReceipt[] }>;

const cartIdSchema = z.object({ cartId: z.uuid() });
const cartMutationSchema = cartIdSchema.extend({ mutationId: z.uuid() });
const receiptMutationSchema = cartMutationSchema.extend({ receiptId: z.uuid() });
const invalid = (error: z.ZodError): ReceiptMutationResult => ({ success: false, errorCode: "VALIDATION_ERROR", fieldErrors: error.flatten().fieldErrors as FieldErrors });
const failed = (error: unknown): ReceiptMutationResult => ({ success: false, errorCode: toErrorCode(error) === "UNKNOWN" && error instanceof Error ? error.message : toErrorCode(error) });

function importFailed(error: unknown): ReceiptImportResult {
  const errorCode = toErrorCode(error);
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string };
  console.error("Receipt import failed", { errorCode, code: candidate.code, message: candidate.message, details: candidate.details, hint: candidate.hint });
  return { success: false, errorCode: errorCode === "UNKNOWN" && error instanceof Error ? error.message : errorCode };
}

export async function createReceiptImportAction(_state: ReceiptImportResult, formData: FormData): Promise<ReceiptImportResult> {
  const parsed = z.object({
    cartMutationId: z.uuid(),
    receiptMutationId: z.uuid(),
    cleanupMutationId: z.uuid(),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, errorCode: "VALIDATION_ERROR", fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors };
  const file = formData.get("receipt");
  if (!(file instanceof File)) return { success: false, errorCode: "RECEIPT_INVALID" };

  const { userId } = await requireUser();
  let cartId: string | null = null;
  let objectPath: string | null = null;
  try {
    const environment = getServerEnvironment();
    const image = await processReceiptImage(file, environment.RECEIPT_MAX_BYTES);
    const supabase = await createClient();
    const created = await supabase.rpc("create_receipt_import_cart", { mutation_id: parsed.data.cartMutationId });
    if (created.error) return importFailed(created.error);
    const createdCart = z.object({ cartId: z.uuid() }).safeParse(created.data);
    if (!createdCart.success) return { success: false, errorCode: "INVALID_SERVER_RESPONSE" };
    cartId = createdCart.data.cartId;
    objectPath = createReceiptObjectPath(userId, cartId, parsed.data.receiptMutationId);

    const storage = createAdminClient().storage.from("receipts");
    const upload = await storage.upload(objectPath, image.bytes, { contentType: image.mimeType, upsert: false, cacheControl: "0" });
    if (upload.error) {
      const folder = `${userId}/${cartId}`;
      const existing = await storage.list(folder, { limit: 2, search: `${parsed.data.receiptMutationId}.jpg` });
      if (existing.error || !existing.data.some((object) => object.name === `${parsed.data.receiptMutationId}.jpg`)) throw upload.error;
    }

    const metadata = await supabase.rpc("create_receipt_metadata", {
      cart_id: cartId,
      metadata: { objectPath, mimeType: image.mimeType, byteSize: image.bytes.length, width: image.width, height: image.height },
      mutation_id: parsed.data.receiptMutationId,
    });
    if (metadata.error) throw metadata.error;
    revalidatePath("/history");
    return { success: true, data: { cartId } };
  } catch (error) {
    if (objectPath) await createAdminClient().storage.from("receipts").remove([objectPath]);
    if (cartId) {
      const supabase = await createClient();
      const cleanup = await supabase.rpc("discard_empty_receipt_import_cart", { cart_id: cartId, mutation_id: parsed.data.cleanupMutationId });
      if (cleanup.error) console.error("Receipt import cleanup failed", { cartId, code: cleanup.error.code, message: cleanup.error.message });
    }
    return importFailed(error);
  }
}

export async function uploadReceiptAction(_state: ReceiptMutationResult, formData: FormData): Promise<ReceiptMutationResult> {
  const parsed = cartMutationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalid(parsed.error);
  const file = formData.get("receipt");
  if (!(file instanceof File)) return { success: false, errorCode: "RECEIPT_INVALID" };
  const { userId } = await requireUser();
  const supabase = await createClient();
  const detailResult = await supabase.rpc("get_history_cart_detail", { cart_id: parsed.data.cartId });
  const detail = historyCartDetailSchema.safeParse(detailResult.data);
  if (detailResult.error || !detail.success || !detail.data.canManageReceipts || detail.data.ownerId !== userId) return { success: false, errorCode: "NOT_AUTHORIZED" };
  try {
    const environment = getServerEnvironment();
    const image = await processReceiptImage(file, environment.RECEIPT_MAX_BYTES);
    const objectPath = createReceiptObjectPath(userId, parsed.data.cartId, parsed.data.mutationId);
    const storage = createAdminClient().storage.from("receipts");
    const upload = await storage.upload(objectPath, image.bytes, { contentType: image.mimeType, upsert: false, cacheControl: "0" });
    if (upload.error) {
      const folder = `${userId}/${parsed.data.cartId}`;
      const existing = await storage.list(folder, { limit: 2, search: `${parsed.data.mutationId}.jpg` });
      if (existing.error || !existing.data.some((object) => object.name === `${parsed.data.mutationId}.jpg`)) return failed(upload.error);
    }
    const metadata = await supabase.rpc("create_receipt_metadata", {
      cart_id: parsed.data.cartId,
      metadata: { objectPath, mimeType: image.mimeType, byteSize: image.bytes.length, width: image.width, height: image.height },
      mutation_id: parsed.data.mutationId,
    });
    if (metadata.error) {
      await storage.remove([objectPath]);
      return failed(metadata.error);
    }
    revalidatePath(`/history/${parsed.data.cartId}`);
    return { success: true, data: { message: "RECEIPT_UPLOADED" } };
  } catch (error) {
    return failed(error);
  }
}

export async function getReceiptSignedUrlsAction(_state: SignedReceiptResult, formData: FormData): Promise<SignedReceiptResult> {
  const parsed = cartIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, errorCode: "VALIDATION_ERROR", fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors };
  await requireUser();
  const supabase = await createClient();
  const [detailResult, receiptsResult] = await Promise.all([
    supabase.rpc("get_history_cart_detail", { cart_id: parsed.data.cartId }),
    supabase.rpc("get_history_cart_receipts", { cart_id: parsed.data.cartId }),
  ]);
  if (detailResult.error || receiptsResult.error || !historyCartDetailSchema.safeParse(detailResult.data).success) return { success: false, errorCode: toErrorCode(detailResult.error ?? receiptsResult.error) };
  const receipts = receiptMetadataListSchema.safeParse(receiptsResult.data);
  if (!receipts.success) return { success: false, errorCode: "UNKNOWN" };
  try {
    const ttl = getServerEnvironment().RECEIPT_SIGNED_URL_TTL_SECONDS;
    const storage = createAdminClient().storage.from("receipts");
    const signed = await Promise.all(receipts.data.map(async (receipt) => {
      const result = await storage.createSignedUrl(receipt.objectPath, ttl);
      if (result.error || !result.data.signedUrl) throw result.error ?? new Error("SIGNED_URL_FAILED");
      return { id: receipt.id, url: result.data.signedUrl, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
    }));
    return { success: true, data: { receipts: signed } };
  } catch (error) {
    return { success: false, errorCode: toErrorCode(error) };
  }
}

export async function deleteReceiptAction(_state: ReceiptMutationResult, formData: FormData): Promise<ReceiptMutationResult> {
  const parsed = receiptMutationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalid(parsed.error);
  const { userId } = await requireUser();
  const supabase = await createClient();
  const [detailResult, receiptsResult] = await Promise.all([
    supabase.rpc("get_history_cart_detail", { cart_id: parsed.data.cartId }),
    supabase.rpc("get_history_cart_receipts", { cart_id: parsed.data.cartId }),
  ]);
  const detail = historyCartDetailSchema.safeParse(detailResult.data);
  const receipts = receiptMetadataListSchema.safeParse(receiptsResult.data);
  if (detailResult.error || receiptsResult.error) return failed(detailResult.error ?? receiptsResult.error);
  if (!detail.success || !receipts.success) return { success: false, errorCode: "UNKNOWN" };
  if (!detail.data.canManageReceipts || detail.data.ownerId !== userId) return { success: false, errorCode: "NOT_AUTHORIZED" };
  const target = receipts.data.find((receipt) => receipt.id === parsed.data.receiptId);
  if (target) {
    const removed = await createAdminClient().storage.from("receipts").remove([target.objectPath]);
    if (removed.error) return failed(removed.error);
  }
  const deleted = await supabase.rpc("delete_receipt", { cart_id: parsed.data.cartId, receipt_id: parsed.data.receiptId, mutation_id: parsed.data.mutationId });
  if (deleted.error) return failed(deleted.error);
  if (!z.object({ objectPath: z.string().min(1) }).safeParse(deleted.data).success) return { success: false, errorCode: "UNKNOWN" };
  revalidatePath(`/history/${parsed.data.cartId}`);
  return { success: true, data: { message: "RECEIPT_DELETED" } };
}

export async function deleteEmptyReceiptImportAction(_state: ReceiptMutationResult, formData: FormData): Promise<ReceiptMutationResult> {
  const parsed = cartMutationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalid(parsed.error);
  const { userId } = await requireUser();
  const supabase = await createClient();
  const [detailResult, itemsResult, receiptsResult] = await Promise.all([
    supabase.rpc("get_history_cart_detail", { cart_id: parsed.data.cartId }),
    supabase.rpc("get_history_cart_items", { cart_id: parsed.data.cartId }),
    supabase.rpc("get_history_cart_receipts", { cart_id: parsed.data.cartId }),
  ]);
  const detail = historyCartDetailSchema.safeParse(detailResult.data);
  const items = historyCartItemsSchema.safeParse(itemsResult.data);
  const receipts = receiptMetadataListSchema.safeParse(receiptsResult.data);
  if (detailResult.error || itemsResult.error || receiptsResult.error) return failed(detailResult.error ?? itemsResult.error ?? receiptsResult.error);
  if (!detail.success || !items.success || !receipts.success) return { success: false, errorCode: "UNKNOWN" };
  if (!detail.data.isReceiptImport || detail.data.ownerId !== userId || !detail.data.canManageReceipts || items.data.length > 0 || Number(detail.data.total) !== 0) {
    return { success: false, errorCode: "NOT_AUTHORIZED" };
  }
  const objectPaths = receipts.data.map((receipt) => receipt.objectPath);
  if (objectPaths.length > 0) {
    const removed = await createAdminClient().storage.from("receipts").remove(objectPaths);
    if (removed.error) return failed(removed.error);
  }
  const deleted = await supabase.rpc("delete_empty_receipt_import_cart", { cart_id: parsed.data.cartId, mutation_id: parsed.data.mutationId });
  if (deleted.error) return failed(deleted.error);
  revalidatePath("/history");
  revalidatePath(`/history/${parsed.data.cartId}`);
  return { success: true, data: { message: "RECEIPT_IMPORT_DELETED" } };
}

export async function reorderReceiptsAction(formData: FormData): Promise<void> {
  const parsed = z.object({ cartId: z.uuid(), orderedIds: z.string(), mutationId: z.uuid() }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  let decoded: unknown;
  try {
    decoded = JSON.parse(parsed.data.orderedIds);
  } catch {
    return;
  }
  const orderedIds = z.array(z.uuid()).safeParse(decoded);
  if (!orderedIds.success) return;
  const { error } = await (await createClient()).rpc("reorder_receipts", { cart_id: parsed.data.cartId, ordered_ids: orderedIds.data, mutation_id: parsed.data.mutationId });
  if (error) throw new Error(toErrorCode(error));
  revalidatePath(`/history/${parsed.data.cartId}`);
}
