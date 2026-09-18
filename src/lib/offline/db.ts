"use client";

import Dexie, { type EntityTable } from "dexie";
import type { OfflineCartItem, OfflineIdMap, OfflineMeta, OfflineMutation } from "./types";

class MeuCestoOfflineDatabase extends Dexie {
  mutations!: EntityTable<OfflineMutation, "mutationId">;
  offlineCartItems!: EntityTable<OfflineCartItem, "temporaryId">;
  idMap!: EntityTable<OfflineIdMap, "temporaryId">;
  meta!: EntityTable<OfflineMeta, "key">;

  constructor() {
    super("meu-cesto-offline-v1");
    this.version(1).stores({
      mutations: "mutationId, userId, [userId+status], [userId+resourceId], localTimestamp, nextAttemptAt",
      offlineCartItems: "temporaryId, [userId+cartId], mutationId, status",
      idMap: "temporaryId, userId, serverId",
      meta: "key",
    });
    this.version(2).stores({
      mutations: "mutationId, userId, [userId+status], [userId+resourceId], localTimestamp, nextAttemptAt",
      offlineCartItems: "temporaryId, [userId+cartId], mutationId, status",
      idMap: "temporaryId, userId, serverId",
      meta: "key",
    });
    this.version(3).stores({
      mutations: "mutationId, userId, [userId+status], [userId+resourceId], localTimestamp, nextAttemptAt",
      offlineCartItems: "temporaryId, [userId+cartId], mutationId, status",
      idMap: "temporaryId, userId, serverId",
      meta: "key",
    }).upgrade(async (transaction) => {
      await transaction.table<OfflineCartItem, string>("offlineCartItems").toCollection().modify((item) => {
        item.isDeleted = false;
      });
    });
  }
}

let database: MeuCestoOfflineDatabase | null = null;

export function getOfflineDatabase(): MeuCestoOfflineDatabase {
  database ??= new MeuCestoOfflineDatabase();
  return database;
}

export async function setCurrentOfflineUser(userId: string): Promise<void> {
  const db = getOfflineDatabase();
  const current = await db.meta.get("current-user");
  if (current?.value && current.value !== userId) await clearAllOfflineData();
  await db.transaction("rw", db.mutations, db.offlineCartItems, db.meta, async () => {
    const interrupted = await db.mutations.where("[userId+status]").equals([userId, "syncing"]).primaryKeys();
    if (interrupted.length) {
      await db.mutations.bulkUpdate(interrupted.map((mutationId) => ({ key: mutationId, changes: { status: "pending", nextAttemptAt: Date.now() } })));
      for (const mutationId of interrupted) await db.offlineCartItems.where("mutationId").equals(mutationId).modify({ status: "pending" });
    }
    await db.meta.bulkPut([{ key: "current-user", value: userId }, { key: "schema-version", value: "3" }]);
  });
}

export async function clearAllOfflineData(): Promise<void> {
  const db = getOfflineDatabase();
  await db.transaction("rw", db.mutations, db.offlineCartItems, db.idMap, db.meta, async () => {
    await Promise.all([db.mutations.clear(), db.offlineCartItems.clear(), db.idMap.clear(), db.meta.clear()]);
  });
}
