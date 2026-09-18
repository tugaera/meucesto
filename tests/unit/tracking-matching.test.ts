import { describe, expect, it } from "vitest";
import { buildTrackingMatches, normalizeTrackingName } from "@/features/shopping/tracking-matching";

describe("shopping-list tracking matching", () => {
  it("normalizes whitespace and casing", () => {
    expect(normalizeTrackingName("  Leite   Meio-Gordo ")).toBe("leite meio-gordo");
  });

  it("prefers an exact product id over fuzzy names", () => {
    const result = buildTrackingMatches(
      [
        { id: "list-a", productId: "product-a", name: "Milk" },
        { id: "list-b", productId: "product-b", name: "Whole milk" },
      ],
      [{ id: "cart-a", productId: "product-a", name: "Whole milk" }],
    );
    expect([...result.automaticIds]).toEqual(["list-a"]);
    expect(result.ambiguities).toEqual([]);
  });

  it("requires a choice when a fallback name matches several items", () => {
    const result = buildTrackingMatches(
      [
        { id: "list-a", productId: null, name: "Arroz" },
        { id: "list-b", productId: null, name: "Arroz integral" },
      ],
      [{ id: "cart-a", productId: null, name: "Arroz integral agulha" }],
    );
    expect(result.automaticIds.size).toBe(0);
    expect(result.ambiguities).toEqual([{ cartItemId: "cart-a", cartItemName: "Arroz integral agulha", candidateIds: ["list-a", "list-b"] }]);
  });
});
