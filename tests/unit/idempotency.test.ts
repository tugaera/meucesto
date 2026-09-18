import { describe, expect, it } from "vitest";
import { createMutationId, isUuid } from "@/lib/idempotency";

describe("caller mutation identifiers", () => {
  it("creates valid, unique UUIDs suitable for retry reuse", () => {
    const first = createMutationId();
    const second = createMutationId();
    expect(isUuid(first)).toBe(true);
    expect(isUuid(second)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("rejects malformed identifiers", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
