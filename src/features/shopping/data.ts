import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toErrorCode } from "@/lib/errors";
import {
  cartItemsSchema,
  cartSchema,
  listDirectorySchema,
  referenceDataSchema,
  type Cart,
  type CartItem,
  type ListDirectoryItem,
  type ReferenceData,
} from "@/types/domain";

const sharedCartSchema = z.object({ id: z.uuid(), ownerEmail: z.string(), storeName: z.string().nullable(), total: z.union([z.string(), z.number()]).transform(String), revision: z.number().int() });
const memberSchema = z.object({ shareId: z.uuid(), userId: z.uuid(), email: z.string(), createdAt: z.string() });
const trackingSchema = z.object({
  cartId: z.uuid(), listId: z.uuid().nullable(), revision: z.number().int(),
  state: z.object({ manuallyChecked: z.array(z.uuid()), suppressedAutoMatch: z.array(z.uuid()) }),
  items: z.array(z.object({ id: z.uuid(), productId: z.uuid().nullable(), name: z.string(), barcode: z.string().nullable(), quantity: z.string(), revision: z.number().int() })),
});

export interface ShoppingData {
  userId: string;
  checkoutKey: string;
  cart: Cart;
  items: CartItem[];
  references: ReferenceData;
  lists: ListDirectoryItem[];
  sharedCarts: z.infer<typeof sharedCartSchema>[];
  members: z.infer<typeof memberSchema>[];
  tracking: z.infer<typeof trackingSchema> | null;
  requestedTrackingList: ListDirectoryItem | null;
}

async function expectRpc<T>(promise: PromiseLike<{ data: unknown; error: { message: string } | null }>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(toErrorCode(error));
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("INVALID_SERVER_RESPONSE");
  return parsed.data;
}

export async function loadShoppingData(requestedCartId?: string, requestedListId?: string): Promise<ShoppingData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("NOT_AUTHENTICATED");
  let cartId = requestedCartId;
  if (!cartId || !z.uuid().safeParse(cartId).success) {
    const created = await expectRpc(supabase.rpc("get_or_create_active_cart", { mutation_id: crypto.randomUUID() }), cartSchema);
    cartId = created.id;
  }
  const cart = await expectRpc(supabase.rpc("get_cart_by_id", { cart_id: cartId }), cartSchema);
  const [items, references, lists, sharedCarts] = await Promise.all([
    expectRpc(supabase.rpc("get_cart_items", { cart_id: cartId }), cartItemsSchema),
    expectRpc(supabase.rpc("get_catalog_reference_data"), referenceDataSchema),
    expectRpc(supabase.rpc("get_lists_directory", { page_size: 100 }), listDirectorySchema),
    expectRpc(supabase.rpc("get_shared_active_carts"), z.array(sharedCartSchema)),
  ]);
  const members = cart.isOwner
    ? await expectRpc(supabase.rpc("get_cart_members", { cart_id: cartId }), z.array(memberSchema))
    : [];
  const tracking = cart.trackingListId
    ? await expectRpc(supabase.rpc("get_tracking_state", { cart_id: cartId }), trackingSchema)
    : null;
  const requestedTrackingList = requestedListId && requestedListId !== cart.trackingListId
    ? lists.find((list) => list.id === requestedListId) ?? null
    : null;
  if (requestedListId && !z.uuid().safeParse(requestedListId).success || requestedListId && requestedListId !== cart.trackingListId && !requestedTrackingList) throw new Error("RESOURCE_NOT_FOUND");
  return { userId: user.id, checkoutKey: crypto.randomUUID(), cart, items, references, lists, sharedCarts, members, tracking, requestedTrackingList };
}
