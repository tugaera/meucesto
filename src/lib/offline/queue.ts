"use client";

import { liveQuery } from "dexie";
import { createClient } from "@/lib/supabase/client";
import { cartSchema } from "@/types/domain";
import { getOfflineDatabase } from "./db";
import { classifyOfflineError, eligibleMutations, MAX_OFFLINE_MUTATION_AGE_MS, retryDelayMs } from "./scheduler";
import { offlineOperationSchema, type OfflineCartItem, type OfflineMutation, type OfflineOperation } from "./types";

interface EnqueueCartUpdateInput {
  userId: string;
  cartId: string;
  itemId: string;
  expectedItemRevision: number;
  name: string;
  price: string;
  originalPrice: string | null;
  quantity: string;
}

interface EnqueueCartDeleteInput {
  userId: string;
  cartId: string;
  itemId: string;
  expectedItemRevision: number;
}

export function subscribeToOfflineItems(userId: string, cartId: string, callback: (items: OfflineCartItem[]) => void): () => void {
  const db = getOfflineDatabase();
  const subscription = liveQuery(() => db.offlineCartItems.where("[userId+cartId]").equals([userId, cartId]).sortBy("localTimestamp")).subscribe({ next: callback });
  return () => subscription.unsubscribe();
}

export function subscribeToQueueState(userId: string, callback: (mutations: OfflineMutation[]) => void): () => void {
  const db = getOfflineDatabase();
  const subscription = liveQuery(() => db.mutations.where("userId").equals(userId).toArray()).subscribe({ next: callback });
  return () => subscription.unsubscribe();
}

export async function enqueueCartAdd(input: { userId: string; cartId: string; name: string; barcode: string | null; productId: string | null; price: string; originalPrice: string | null; quantity: string }): Promise<string> {
  const mutationId = crypto.randomUUID();
  const temporaryId = `local-${crypto.randomUUID()}`;
  const localTimestamp = Date.now();
  const operation = offlineOperationSchema.parse({ operation: "cart.add_item", payload: { ...input, temporaryId } });
  const mutation: OfflineMutation = {
    mutationId,
    userId: input.userId,
    resourceType: "cart",
    resourceId: input.cartId,
    localTimestamp,
    operation: operation.operation,
    payload: operation.payload,
    dependencyIds: [],
    retryCount: 0,
    nextAttemptAt: localTimestamp,
    lastErrorCode: null,
    status: "pending",
  };
  const item: OfflineCartItem = { temporaryId, userId: input.userId, cartId: input.cartId, mutationId, name: input.name, price: input.price, originalPrice: input.originalPrice, quantity: input.quantity, localTimestamp, status: "pending", lastErrorCode: null, isDeleted: false };
  const db = getOfflineDatabase();
  await db.transaction("rw", db.mutations, db.offlineCartItems, async () => { await db.mutations.add(mutation); await db.offlineCartItems.add(item); });
  return mutationId;
}

function targetItemId(mutation: OfflineMutation): string | null {
  const operation = offlineOperationSchema.safeParse({ operation: mutation.operation, payload: mutation.payload });
  if (!operation.success) return null;
  return operation.data.operation === "cart.add_item" ? operation.data.payload.temporaryId : operation.data.payload.itemId;
}

function localItemIdForMutation(mutation: OfflineMutation): string | null {
  const itemId = targetItemId(mutation);
  return itemId?.startsWith("local-") ? itemId : null;
}

async function relatedItemMutations(userId: string, cartId: string, itemId: string): Promise<OfflineMutation[]> {
  const mutations = await getOfflineDatabase().mutations.where("[userId+resourceId]").equals([userId, cartId]).toArray();
  return mutations
    .filter((mutation) => targetItemId(mutation) === itemId)
    .sort((left, right) => left.localTimestamp - right.localTimestamp || left.mutationId.localeCompare(right.mutationId));
}

function latestUnfinishedDependency(mutations: readonly OfflineMutation[]): string[] {
  const latest = [...mutations].reverse().find((mutation) => mutation.status !== "completed");
  return latest ? [latest.mutationId] : [];
}

export async function enqueueCartUpdate(input: EnqueueCartUpdateInput): Promise<string> {
  const related = await relatedItemMutations(input.userId, input.cartId, input.itemId);
  const isLocal = input.itemId.startsWith("local-");
  if (isLocal && !related.some((mutation) => mutation.operation === "cart.add_item")) throw new Error("DEPENDENCY_NOT_READY");
  if (related.some((mutation) => mutation.status === "failed")) throw new Error("DEPENDENCY_FAILED");
  if (related.some((mutation) => mutation.operation === "cart.delete_item" && mutation.status !== "completed")) throw new Error("ITEM_DELETE_PENDING");
  const queuedUpdates = isLocal ? 0 : related.filter((mutation) => mutation.operation === "cart.update_item" && mutation.status !== "completed").length;
  const operation = offlineOperationSchema.parse({
    operation: "cart.update_item",
    payload: {
      cartId: input.cartId,
      itemId: input.itemId,
      expectedItemRevision: input.expectedItemRevision + queuedUpdates,
      name: input.name,
      price: input.price,
      originalPrice: input.originalPrice,
      quantity: input.quantity,
    },
  });
  const mutationId = crypto.randomUUID();
  const localTimestamp = Math.max(Date.now(), (related.at(-1)?.localTimestamp ?? 0) + 1);
  const mutation: OfflineMutation = {
    mutationId,
    userId: input.userId,
    resourceType: "cart",
    resourceId: input.cartId,
    localTimestamp,
    operation: operation.operation,
    payload: operation.payload,
    dependencyIds: latestUnfinishedDependency(related),
    retryCount: 0,
    nextAttemptAt: localTimestamp,
    lastErrorCode: null,
    status: "pending",
  };
  const db = getOfflineDatabase();
  await db.transaction("rw", db.mutations, db.offlineCartItems, async () => {
    await db.mutations.add(mutation);
    if (isLocal) {
      const changed = await db.offlineCartItems.update(input.itemId, {
        mutationId,
        name: input.name,
        price: input.price,
        originalPrice: input.originalPrice,
        quantity: input.quantity,
        status: "pending",
        lastErrorCode: null,
        isDeleted: false,
      });
      if (!changed) throw new Error("DEPENDENCY_NOT_READY");
    }
  });
  return mutationId;
}

export async function enqueueCartDelete(input: EnqueueCartDeleteInput): Promise<string> {
  const related = await relatedItemMutations(input.userId, input.cartId, input.itemId);
  const isLocal = input.itemId.startsWith("local-");
  if (isLocal && !related.some((mutation) => mutation.operation === "cart.add_item")) throw new Error("DEPENDENCY_NOT_READY");
  if (related.some((mutation) => mutation.status === "failed")) throw new Error("DEPENDENCY_FAILED");
  if (related.some((mutation) => mutation.operation === "cart.delete_item" && mutation.status !== "completed")) throw new Error("ITEM_DELETE_PENDING");
  const queuedUpdates = isLocal ? 0 : related.filter((mutation) => mutation.operation === "cart.update_item" && mutation.status !== "completed").length;
  const operation = offlineOperationSchema.parse({
    operation: "cart.delete_item",
    payload: {
      cartId: input.cartId,
      itemId: input.itemId,
      expectedItemRevision: input.expectedItemRevision + queuedUpdates,
    },
  });
  const mutationId = crypto.randomUUID();
  const localTimestamp = Math.max(Date.now(), (related.at(-1)?.localTimestamp ?? 0) + 1);
  const mutation: OfflineMutation = {
    mutationId,
    userId: input.userId,
    resourceType: "cart",
    resourceId: input.cartId,
    localTimestamp,
    operation: operation.operation,
    payload: operation.payload,
    dependencyIds: latestUnfinishedDependency(related),
    retryCount: 0,
    nextAttemptAt: localTimestamp,
    lastErrorCode: null,
    status: "pending",
  };
  const db = getOfflineDatabase();
  await db.transaction("rw", db.mutations, db.offlineCartItems, async () => {
    await db.mutations.add(mutation);
    if (isLocal) {
      const changed = await db.offlineCartItems.update(input.itemId, { mutationId, status: "pending", lastErrorCode: null, isDeleted: true });
      if (!changed) throw new Error("DEPENDENCY_NOT_READY");
    }
  });
  return mutationId;
}

async function serverTargetFor(userId: string, itemId: string): Promise<{ itemId: string; revision?: number } | null> {
  if (!itemId.startsWith("local-")) return { itemId };
  const mapping = await getOfflineDatabase().idMap.get(itemId);
  if (mapping?.userId !== userId) return null;
  return mapping.serverRevision === undefined ? { itemId: mapping.serverId } : { itemId: mapping.serverId, revision: mapping.serverRevision };
}

function replayedItem(data: unknown): { serverItemId?: string; serverItemRevision?: number } {
  if (typeof data !== "object" || data === null || !("item" in data) || typeof data.item !== "object" || data.item === null) return {};
  const serverItemId = "id" in data.item && typeof data.item.id === "string" ? data.item.id : undefined;
  const serverItemRevision = "revision" in data.item && typeof data.item.revision === "number" ? data.item.revision : undefined;
  return {
    ...(serverItemId === undefined ? {} : { serverItemId }),
    ...(serverItemRevision === undefined ? {} : { serverItemRevision }),
  };
}

async function replay(mutation: OfflineMutation): Promise<{ serverItemId?: string; serverItemRevision?: number }> {
  const operation = offlineOperationSchema.parse({ operation: mutation.operation, payload: mutation.payload }) as OfflineOperation;
  const supabase = createClient();
  if (operation.operation === "cart.add_item") {
    const cartResult = await supabase.rpc("get_cart_by_id", { cart_id: operation.payload.cartId });
    if (cartResult.error) throw cartResult.error;
    const cart = cartSchema.parse(cartResult.data);
    const result = await supabase.rpc("add_or_merge_cart_item", {
      cart_id: operation.payload.cartId,
      item: { name: operation.payload.name, barcode: operation.payload.barcode, productId: operation.payload.productId, price: operation.payload.price, originalPrice: operation.payload.originalPrice, quantity: operation.payload.quantity },
      expected_revision: cart.revision,
      mutation_id: mutation.mutationId,
    });
    if (result.error) throw result.error;
    return replayedItem(result.data);
  }
  const target = await serverTargetFor(mutation.userId, operation.payload.itemId);
  if (!target) throw new Error("DEPENDENCY_NOT_READY");
  const expectedItemRevision = target.revision ?? operation.payload.expectedItemRevision;
  if (operation.operation === "cart.update_item") {
    const result = await supabase.rpc("update_cart_item", { cart_id: operation.payload.cartId, item_id: target.itemId, updates: { name: operation.payload.name, price: operation.payload.price, originalPrice: operation.payload.originalPrice, quantity: operation.payload.quantity }, expected_item_revision: expectedItemRevision, mutation_id: mutation.mutationId });
    if (result.error) throw result.error;
    return replayedItem(result.data);
  }
  const result = await supabase.rpc("delete_cart_item", { cart_id: operation.payload.cartId, item_id: target.itemId, expected_item_revision: expectedItemRevision, mutation_id: mutation.mutationId });
  if (result.error) throw result.error;
  return {};
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "NETWORK_ERROR";
  const known = ["REVISION_CONFLICT", "VALIDATION_ERROR", "NOT_AUTHENTICATED", "NOT_AUTHORIZED", "RESOURCE_NOT_FOUND", "CART_FINALIZED", "STORE_REQUIRED"];
  return known.find((code) => message.includes(code)) ?? "NETWORK_ERROR";
}

let syncing = false;

export async function processOfflineQueue(userId: string): Promise<boolean> {
  if (syncing || !navigator.onLine) return false;
  syncing = true;
  const db = getOfflineDatabase();
  let changed = false;
  try {
    const all = await db.mutations.where("userId").equals(userId).toArray();
    const now = Date.now();
    const expired = all.filter((mutation) => mutation.status !== "completed" && now - mutation.localTimestamp > MAX_OFFLINE_MUTATION_AGE_MS);
    await Promise.all(expired.map(async (mutation) => {
      changed = true;
      await db.mutations.update(mutation.mutationId, { status: "failed", lastErrorCode: "MUTATION_EXPIRED" });
      const localItemId = localItemIdForMutation(mutation);
      if (localItemId) await db.offlineCartItems.update(localItemId, { mutationId: mutation.mutationId, status: "failed", lastErrorCode: "MUTATION_EXPIRED" });
    }));
    for (const mutation of eligibleMutations(all, now)) {
      changed = true;
      await db.mutations.update(mutation.mutationId, { status: "syncing" });
      const optimisticItemId = localItemIdForMutation(mutation);
      if (optimisticItemId) await db.offlineCartItems.update(optimisticItemId, { mutationId: mutation.mutationId, status: "syncing", lastErrorCode: null });
      try {
        const result = await replay(mutation);
        await db.transaction("rw", db.mutations, db.offlineCartItems, db.idMap, async () => {
          await db.mutations.update(mutation.mutationId, { status: "completed", lastErrorCode: null });
          const temporaryId = mutation.operation === "cart.add_item" && "temporaryId" in mutation.payload ? mutation.payload.temporaryId : null;
          const localItemId = mutation.operation !== "cart.add_item" && "itemId" in mutation.payload && mutation.payload.itemId.startsWith("local-") ? mutation.payload.itemId : null;
          if (temporaryId && result.serverItemId) {
            await db.idMap.put({ temporaryId, userId, serverId: result.serverItemId, ...(result.serverItemRevision === undefined ? {} : { serverRevision: result.serverItemRevision }) });
          } else if (localItemId && result.serverItemRevision !== undefined) {
            await db.idMap.update(localItemId, { serverRevision: result.serverItemRevision });
          }
          if (localItemId && mutation.operation === "cart.delete_item") await db.idMap.delete(localItemId);
          const optimisticId = temporaryId ?? localItemId;
          if (optimisticId) {
            const remaining = (await db.mutations.where("[userId+resourceId]").equals([userId, mutation.resourceId]).toArray())
              .filter((candidate) => candidate.status !== "completed" && localItemIdForMutation(candidate) === optimisticId)
              .sort((left, right) => left.localTimestamp - right.localTimestamp || left.mutationId.localeCompare(right.mutationId));
            const next = remaining[0];
            if (next) {
              await db.offlineCartItems.update(optimisticId, { mutationId: next.mutationId, status: next.status, lastErrorCode: next.lastErrorCode });
            } else {
              await db.offlineCartItems.delete(optimisticId);
            }
          }
        });
      } catch (error) {
        const code = errorCode(error);
        const classification = classifyOfflineError(code);
        if (classification === "transient") {
          const retryCount = mutation.retryCount + 1;
          await db.mutations.update(mutation.mutationId, { status: "pending", retryCount, nextAttemptAt: Date.now() + retryDelayMs(retryCount), lastErrorCode: code });
          if (optimisticItemId) await db.offlineCartItems.update(optimisticItemId, { mutationId: mutation.mutationId, status: "pending", lastErrorCode: code });
        } else {
          await db.mutations.update(mutation.mutationId, { status: "failed", lastErrorCode: code });
          if (optimisticItemId) await db.offlineCartItems.update(optimisticItemId, { mutationId: mutation.mutationId, status: "failed", lastErrorCode: code });
        }
      }
    }
  } finally {
    syncing = false;
  }
  return changed;
}

export async function retryOfflineMutation(mutationId: string): Promise<void> {
  const db = getOfflineDatabase();
  const mutation = await db.mutations.get(mutationId);
  if (!mutation) return;
  const unfinished = (await db.mutations.where("[userId+resourceId]").equals([mutation.userId, mutation.resourceId]).toArray())
    .filter((candidate) => candidate.status !== "completed")
    .sort((left, right) => left.localTimestamp - right.localTimestamp || left.mutationId.localeCompare(right.mutationId));
  const now = Date.now();
  await db.transaction("rw", db.mutations, db.offlineCartItems, async () => {
    await db.mutations.bulkUpdate(unfinished.map((candidate, index) => ({ key: candidate.mutationId, changes: { localTimestamp: now + index } })));
    await db.mutations.update(mutationId, { status: "pending", nextAttemptAt: now, lastErrorCode: null });
    const localItemId = localItemIdForMutation(mutation);
    if (localItemId) await db.offlineCartItems.update(localItemId, { mutationId, status: "pending", lastErrorCode: null });
  });
}
