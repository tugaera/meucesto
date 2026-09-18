import type { OfflineMutation } from "./types";

export const MAX_OFFLINE_MUTATION_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

export function eligibleMutations(mutations: readonly OfflineMutation[], now: number): OfflineMutation[] {
  const ordered = [...mutations].sort((left, right) => left.localTimestamp - right.localTimestamp || left.mutationId.localeCompare(right.mutationId));
  const byId = new Map(ordered.map((mutation) => [mutation.mutationId, mutation]));
  const resourceSeen = new Set<string>();
  const eligible: OfflineMutation[] = [];
  for (const mutation of ordered) {
    if (mutation.status === "completed") continue;
    const resourceKey = `${mutation.resourceType}:${mutation.resourceId}`;
    if (resourceSeen.has(resourceKey)) continue;
    resourceSeen.add(resourceKey);
    if (mutation.status !== "pending" || mutation.nextAttemptAt > now || now - mutation.localTimestamp > MAX_OFFLINE_MUTATION_AGE_MS) continue;
    const dependenciesComplete = mutation.dependencyIds.every((id) => byId.get(id)?.status === "completed");
    if (dependenciesComplete) eligible.push(mutation);
  }
  return eligible;
}

export function retryDelayMs(retryCount: number, random = Math.random()): number {
  const boundedAttempt = Math.min(Math.max(retryCount, 0), 8);
  const base = Math.min(300_000, 1_000 * 2 ** boundedAttempt);
  return Math.round(base * (0.75 + Math.min(Math.max(random, 0), 1) * 0.5));
}

export function classifyOfflineError(errorCode: string): "transient" | "permanent" | "conflict" {
  if (errorCode === "REVISION_CONFLICT") return "conflict";
  if (["VALIDATION_ERROR", "NOT_AUTHENTICATED", "NOT_AUTHORIZED", "RESOURCE_NOT_FOUND", "CART_FINALIZED", "STORE_REQUIRED"].includes(errorCode)) return "permanent";
  return "transient";
}
