import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toErrorCode } from "@/lib/errors";
import { listDetailSchema, listDirectorySchema, listItemsSchema, type ListDetail, type ListDirectoryItem, type ListItem } from "@/types/domain";

const memberSchema = z.object({ shareId: z.uuid(), userId: z.uuid(), email: z.string(), createdAt: z.string() });
export type ListMember = z.infer<typeof memberSchema>;

async function parseRpc<T>(promise: PromiseLike<{ data: unknown; error: { message: string } | null }>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(toErrorCode(error));
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("INVALID_SERVER_RESPONSE");
  return parsed.data;
}

export async function loadLists(): Promise<ListDirectoryItem[]> {
  const supabase = await createClient();
  return parseRpc(supabase.rpc("get_lists_directory", { page_size: 100 }), listDirectorySchema);
}

export async function loadList(listId: string): Promise<{ list: ListDetail; items: ListItem[]; members: ListMember[] }> {
  const supabase = await createClient();
  const list = await parseRpc(supabase.rpc("get_list_by_id", { list_id: listId }), listDetailSchema);
  const [items, members] = await Promise.all([
    parseRpc(supabase.rpc("get_list_items", { list_id: listId }), listItemsSchema),
    list.isOwner ? parseRpc(supabase.rpc("get_list_members", { list_id: listId }), z.array(memberSchema)) : Promise.resolve([]),
  ]);
  return { list, items, members };
}
