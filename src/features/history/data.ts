import "server-only";

import { z } from "zod";
import { toErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import {
  historyCartDetailSchema,
  historyCartItemsSchema,
  historyRowsSchema,
  receiptMetadataListSchema,
  type HistoryCartDetail,
  type HistoryCartItem,
  type HistoryRow,
  type ReceiptMetadata,
} from "@/types/domain";

export interface HistoryPageData {
  rows: HistoryRow[];
  nextCursor: { finalizedAt: string; id: string } | null;
}

export interface HistoryDetailData {
  cart: HistoryCartDetail;
  items: HistoryCartItem[];
  receipts: ReceiptMetadata[];
}

async function expectRpc<T>(promise: PromiseLike<{ data: unknown; error: { message: string } | null }>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(toErrorCode(error));
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("INVALID_SERVER_RESPONSE");
  return parsed.data;
}

export async function loadHistoryPage(cursor?: { finalizedAt: string; id: string }): Promise<HistoryPageData> {
  const supabase = await createClient();
  const rows = await expectRpc(supabase.rpc("get_history_page", {
    ...(cursor ? { cursor_finalized_at: cursor.finalizedAt, cursor_id: cursor.id } : {}),
    page_size: 21,
  }), historyRowsSchema);
  const hasNext = rows.length > 20;
  const visible = hasNext ? rows.slice(0, 20) : rows;
  const last = visible.at(-1);
  return { rows: visible, nextCursor: hasNext && last ? { finalizedAt: last.finalizedAt, id: last.id } : null };
}

export async function loadHistoryDetail(cartId: string): Promise<HistoryDetailData> {
  const parsedId = z.uuid().safeParse(cartId);
  if (!parsedId.success) throw new Error("RESOURCE_NOT_FOUND");
  const supabase = await createClient();
  const [cart, items, receipts] = await Promise.all([
    expectRpc(supabase.rpc("get_history_cart_detail", { cart_id: cartId }), historyCartDetailSchema),
    expectRpc(supabase.rpc("get_history_cart_items", { cart_id: cartId }), historyCartItemsSchema),
    expectRpc(supabase.rpc("get_history_cart_receipts", { cart_id: cartId }), receiptMetadataListSchema),
  ]);
  return { cart, items, receipts };
}
