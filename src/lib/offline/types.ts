import { z } from "zod";

const nullableText = z.string().nullable();
const cartItemValues = z.object({
  cartId: z.uuid(),
  name: z.string().min(1).max(200),
  barcode: nullableText,
  productId: z.uuid().nullable(),
  price: z.string(),
  originalPrice: nullableText,
  quantity: z.string(),
});

export const offlineOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("cart.add_item"), payload: cartItemValues.extend({ temporaryId: z.string().startsWith("local-") }) }),
  z.object({ operation: z.literal("cart.update_item"), payload: cartItemValues.omit({ productId: true, barcode: true }).extend({ itemId: z.string(), expectedItemRevision: z.number().int().positive() }) }),
  z.object({ operation: z.literal("cart.delete_item"), payload: z.object({ cartId: z.uuid(), itemId: z.string(), expectedItemRevision: z.number().int().positive() }) }),
]);

export type OfflineOperation = z.infer<typeof offlineOperationSchema>;
export type OfflineMutationStatus = "pending" | "syncing" | "failed" | "completed";

export interface OfflineMutation {
  mutationId: string;
  userId: string;
  resourceType: "cart";
  resourceId: string;
  localTimestamp: number;
  operation: OfflineOperation["operation"];
  payload: OfflineOperation["payload"];
  dependencyIds: string[];
  retryCount: number;
  nextAttemptAt: number;
  lastErrorCode: string | null;
  status: OfflineMutationStatus;
}

export interface OfflineCartItem {
  temporaryId: string;
  userId: string;
  cartId: string;
  mutationId: string;
  name: string;
  price: string;
  originalPrice: string | null;
  quantity: string;
  localTimestamp: number;
  status: OfflineMutationStatus;
  lastErrorCode: string | null;
  isDeleted: boolean;
}

export interface OfflineIdMap {
  temporaryId: string;
  userId: string;
  serverId: string;
  serverRevision?: number;
}

export interface OfflineMeta {
  key: string;
  value: string;
}
