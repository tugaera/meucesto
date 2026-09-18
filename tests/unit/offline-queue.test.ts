import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/client";
import { clearAllOfflineData, getOfflineDatabase } from "@/lib/offline/db";
import { enqueueCartAdd, enqueueCartDelete, enqueueCartUpdate, processOfflineQueue, retryOfflineMutation } from "@/lib/offline/queue";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

describe("offline cart mutation queue", () => {
  beforeEach(async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.mocked(createClient).mockReset();
    await clearAllOfflineData();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await getOfflineDatabase().delete();
  });

  it("orders dependent local edits and deletes behind their insert", async () => {
    const userId = uuid("1");
    const cartId = uuid("2");
    const addId = await enqueueCartAdd({ userId, cartId, name: "Milk", barcode: null, productId: null, price: "1.20", originalPrice: null, quantity: "1.000" });
    const localItem = (await getOfflineDatabase().offlineCartItems.toArray())[0];
    if (!localItem) throw new Error("Expected an optimistic cart item");

    const updateId = await enqueueCartUpdate({ userId, cartId, itemId: localItem.temporaryId, expectedItemRevision: 1, name: "Whole milk", price: "1.30", originalPrice: "1.50", quantity: "2.000" });
    const deleteId = await enqueueCartDelete({ userId, cartId, itemId: localItem.temporaryId, expectedItemRevision: 1 });
    const mutations = await getOfflineDatabase().mutations.orderBy("localTimestamp").toArray();
    const [addMutation, updateMutation, deleteMutation] = mutations;
    if (!addMutation || !updateMutation || !deleteMutation) throw new Error("Expected three queued mutations");

    expect(mutations.map((mutation) => mutation.mutationId)).toEqual([addId, updateId, deleteId]);
    expect(updateMutation.dependencyIds).toEqual([addId]);
    expect(deleteMutation.dependencyIds).toEqual([updateId]);
    expect(addMutation.localTimestamp).toBeLessThan(updateMutation.localTimestamp);
    expect(updateMutation.localTimestamp).toBeLessThan(deleteMutation.localTimestamp);
    expect(await getOfflineDatabase().offlineCartItems.get(localItem.temporaryId)).toMatchObject({ name: "Whole milk", mutationId: deleteId, isDeleted: true });
    await expect(enqueueCartUpdate({ userId, cartId, itemId: localItem.temporaryId, expectedItemRevision: 1, name: "Skimmed milk", price: "1.10", originalPrice: null, quantity: "1.000" })).rejects.toThrow("ITEM_DELETE_PENDING");
    await expect(enqueueCartDelete({ userId, cartId, itemId: localItem.temporaryId, expectedItemRevision: 1 })).rejects.toThrow("ITEM_DELETE_PENDING");
  });

  it("preserves a failed dependency and renews its age after manual review", async () => {
    const userId = uuid("5");
    const cartId = uuid("6");
    const addId = await enqueueCartAdd({ userId, cartId, name: "Bread", barcode: null, productId: null, price: "1.00", originalPrice: null, quantity: "1.000" });
    const localItem = (await getOfflineDatabase().offlineCartItems.toArray())[0];
    if (!localItem) throw new Error("Expected an optimistic cart item");
    const updateId = await enqueueCartUpdate({ userId, cartId, itemId: localItem.temporaryId, expectedItemRevision: 1, name: "Bread", price: "1.10", originalPrice: null, quantity: "2.000" });
    const db = getOfflineDatabase();
    await db.mutations.update(addId, { status: "failed", lastErrorCode: "MUTATION_EXPIRED", localTimestamp: 1 });
    await db.mutations.update(updateId, { localTimestamp: 2 });
    await db.offlineCartItems.update(localItem.temporaryId, { mutationId: addId, status: "failed", lastErrorCode: "MUTATION_EXPIRED" });

    await expect(enqueueCartUpdate({ userId, cartId, itemId: localItem.temporaryId, expectedItemRevision: 1, name: "Bread", price: "1.20", originalPrice: null, quantity: "3.000" })).rejects.toThrow("DEPENDENCY_FAILED");
    const retriedAt = Date.now();
    await retryOfflineMutation(addId);
    const retriedAdd = await db.mutations.get(addId);
    const dependentUpdate = await db.mutations.get(updateId);

    expect(retriedAdd).toMatchObject({ status: "pending", lastErrorCode: null });
    expect(retriedAdd?.localTimestamp).toBeGreaterThanOrEqual(retriedAt);
    expect(dependentUpdate?.localTimestamp).toBeGreaterThan(retriedAdd?.localTimestamp ?? Number.MAX_SAFE_INTEGER);
    expect(await db.offlineCartItems.get(localItem.temporaryId)).toMatchObject({ mutationId: addId, status: "pending", lastErrorCode: null });
  });

  it("maps a temporary id and advances the server revision through replay", async () => {
    const userId = uuid("10");
    const cartId = uuid("20");
    const storeId = uuid("30");
    const serverItemId = uuid("40");
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "get_cart_by_id") return { data: { id: cartId, ownerId: userId, ownerEmail: "owner@example.test", storeId, storeName: "Store", trackingListId: null, trackingState: { manuallyChecked: [], suppressedAutoMatch: [] }, total: "0.00", revision: 1, finalizedAt: null, isOwner: true, isShared: false, canEditItems: true, canManageCart: true, canManageReceipts: true }, error: null };
      if (name === "add_or_merge_cart_item") return { data: { item: { id: serverItemId, revision: 4 } }, error: null };
      if (name === "update_cart_item") {
        expect(args.expected_item_revision).toBe(4);
        return { data: { item: { id: serverItemId, revision: 5 } }, error: null };
      }
      if (name === "delete_cart_item") {
        expect(args.expected_item_revision).toBe(5);
        return { data: {}, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
    vi.mocked(createClient).mockReturnValue({ rpc } as never);

    await enqueueCartAdd({ userId, cartId, name: "Milk", barcode: null, productId: null, price: "1.20", originalPrice: null, quantity: "1.000" });
    const localItem = (await getOfflineDatabase().offlineCartItems.toArray())[0];
    if (!localItem) throw new Error("Expected an optimistic cart item");
    const updateId = await enqueueCartUpdate({ userId, cartId, itemId: localItem.temporaryId, expectedItemRevision: 1, name: "Whole milk", price: "1.30", originalPrice: null, quantity: "2.000" });
    const deleteId = await enqueueCartDelete({ userId, cartId, itemId: localItem.temporaryId, expectedItemRevision: 1 });

    expect(await processOfflineQueue(userId)).toBe(true);
    expect(await getOfflineDatabase().idMap.get(localItem.temporaryId)).toMatchObject({ serverId: serverItemId, serverRevision: 4 });
    expect(await getOfflineDatabase().offlineCartItems.get(localItem.temporaryId)).toMatchObject({ mutationId: updateId, status: "pending" });

    expect(await processOfflineQueue(userId)).toBe(true);
    expect(await getOfflineDatabase().idMap.get(localItem.temporaryId)).toMatchObject({ serverRevision: 5 });
    expect(await getOfflineDatabase().offlineCartItems.get(localItem.temporaryId)).toMatchObject({ mutationId: deleteId, status: "pending" });

    expect(await processOfflineQueue(userId)).toBe(true);
    expect(await getOfflineDatabase().idMap.get(localItem.temporaryId)).toBeUndefined();
    expect(await getOfflineDatabase().offlineCartItems.get(localItem.temporaryId)).toBeUndefined();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["get_cart_by_id", "add_or_merge_cart_item", "update_cart_item", "delete_cart_item"]);
  });
});
