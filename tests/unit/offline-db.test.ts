import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearAllOfflineData, getOfflineDatabase, setCurrentOfflineUser } from "@/lib/offline/db";
import type { OfflineMutation } from "@/lib/offline/types";

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const queued = (userId: string, status: OfflineMutation["status"] = "pending"): OfflineMutation => ({
  mutationId: uuid(status === "syncing" ? "10" : "11"),
  userId,
  resourceType: "cart",
  resourceId: uuid("20"),
  localTimestamp: 1,
  operation: "cart.delete_item",
  payload: { cartId: uuid("20"), itemId: uuid("21"), expectedItemRevision: 1 },
  dependencyIds: [],
  retryCount: 0,
  nextAttemptAt: 1,
  lastErrorCode: null,
  status,
});

describe("offline user isolation", () => {
  beforeEach(async () => clearAllOfflineData());
  afterAll(async () => getOfflineDatabase().delete());

  it("clears all user-scoped stores when the account changes", async () => {
    const firstUser = uuid("1");
    const db = getOfflineDatabase();
    await setCurrentOfflineUser(firstUser);
    await db.mutations.add(queued(firstUser));
    await db.idMap.add({ temporaryId: "local-one", userId: firstUser, serverId: uuid("30") });
    await setCurrentOfflineUser(uuid("2"));
    expect(await db.mutations.count()).toBe(0);
    expect(await db.idMap.count()).toBe(0);
    expect((await db.meta.get("current-user"))?.value).toBe(uuid("2"));
  });

  it("returns interrupted sync work to pending after reload", async () => {
    const userId = uuid("3");
    const db = getOfflineDatabase();
    await db.mutations.add(queued(userId, "syncing"));
    await setCurrentOfflineUser(userId);
    expect((await db.mutations.get(uuid("10")))?.status).toBe("pending");
  });
});
