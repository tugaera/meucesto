"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/types";
import { toErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type JoinResult = ActionResult<{ joined: true }>;
const schema = z.object({ token: z.string().min(40).max(100), mutationId: z.uuid().optional() });

export async function joinCartAction(_state: JoinResult, formData: FormData): Promise<JoinResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, errorCode: "TOKEN_INVALID_OR_UNAVAILABLE" };
  const { data, error } = await (await createClient()).rpc("join_cart_by_token", { token: parsed.data.token, mutation_id: parsed.data.mutationId ?? crypto.randomUUID() });
  if (error) return { success: false, errorCode: toErrorCode(error) };
  const cartId = typeof data === "object" && data !== null && "cartId" in data && typeof data.cartId === "string" ? data.cartId : null;
  if (!cartId) return { success: false, errorCode: "UNKNOWN" };
  redirect(`/shopping?cart=${cartId}`);
}

export async function joinListAction(_state: JoinResult, formData: FormData): Promise<JoinResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, errorCode: "TOKEN_INVALID_OR_UNAVAILABLE" };
  const { data, error } = await (await createClient()).rpc("join_list_by_token", { token: parsed.data.token, mutation_id: parsed.data.mutationId ?? crypto.randomUUID() });
  if (error) return { success: false, errorCode: toErrorCode(error) };
  const listId = typeof data === "object" && data !== null && "listId" in data && typeof data.listId === "string" ? data.listId : null;
  if (!listId) return { success: false, errorCode: "UNKNOWN" };
  redirect(`/lists/${listId}`);
}
