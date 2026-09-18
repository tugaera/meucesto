import { describe, expect, it } from "vitest";
import { realtimeInvalidationSchema } from "@/lib/realtime/schemas";

const payload = {
  event_id: "00000000-0000-4000-8000-000000000001",
  resource_id: "00000000-0000-4000-8000-000000000002",
  revision: 3,
  mutation_type: "cart.item_updated",
};

describe("Realtime invalidation schema", () => {
  it("accepts a minimal valid event", () => {
    expect(realtimeInvalidationSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects unknown keys and non-positive revisions", () => {
    expect(realtimeInvalidationSchema.safeParse({ ...payload, secret: "leak" }).success).toBe(false);
    expect(realtimeInvalidationSchema.safeParse({ ...payload, revision: 0 }).success).toBe(false);
  });
});
