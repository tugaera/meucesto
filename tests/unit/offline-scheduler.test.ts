import { describe, expect, it } from "vitest";
import { classifyOfflineError, eligibleMutations, MAX_OFFLINE_MUTATION_AGE_MS, retryDelayMs } from "@/lib/offline/scheduler";
import type { OfflineMutation } from "@/lib/offline/types";

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const mutation = (overrides: Partial<OfflineMutation> = {}): OfflineMutation => ({
  mutationId: uuid("1"),
  userId: uuid("2"),
  resourceType: "cart",
  resourceId: uuid("3"),
  localTimestamp: 1_000,
  operation: "cart.delete_item",
  payload: { cartId: uuid("3"), itemId: uuid("4"), expectedItemRevision: 1 },
  dependencyIds: [],
  retryCount: 0,
  nextAttemptAt: 0,
  lastErrorCode: null,
  status: "pending",
  ...overrides,
});

describe("offline mutation scheduling", () => {
  it("preserves order and only schedules one mutation per resource", () => {
    const first = mutation({ mutationId: uuid("10"), localTimestamp: 10 });
    const second = mutation({ mutationId: uuid("11"), localTimestamp: 20 });
    const other = mutation({ mutationId: uuid("12"), resourceId: uuid("30"), localTimestamp: 30 });
    expect(eligibleMutations([second, other, first], 100).map((item) => item.mutationId)).toEqual([first.mutationId, other.mutationId]);
  });

  it("waits for dependencies and excludes expired mutations", () => {
    const dependency = mutation({ mutationId: uuid("20"), status: "completed" });
    const dependent = mutation({ mutationId: uuid("21"), resourceId: uuid("31"), dependencyIds: [dependency.mutationId] });
    const stale = mutation({ mutationId: uuid("22"), resourceId: uuid("32"), localTimestamp: 0 });
    const now = MAX_OFFLINE_MUTATION_AGE_MS + 1;
    expect(eligibleMutations([dependent, dependency, stale], now).map((item) => item.mutationId)).toEqual([dependent.mutationId]);
  });

  it("bounds retry jitter and classifies failures", () => {
    expect(retryDelayMs(0, 0)).toBe(750);
    expect(retryDelayMs(0, 1)).toBe(1_250);
    expect(retryDelayMs(99, 0.5)).toBe(256_000);
    expect(classifyOfflineError("REVISION_CONFLICT")).toBe("conflict");
    expect(classifyOfflineError("NOT_AUTHORIZED")).toBe("permanent");
    expect(classifyOfflineError("NETWORK_ERROR")).toBe("transient");
  });
});
