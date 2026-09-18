import { describe, expect, it } from "vitest";
import { normalizeBarcode, parsePackageMeasurement } from "@/lib/barcode/normalize";

describe("barcode normalization and package parsing", () => {
  it("normalizes scanner punctuation without discarding letters", () => {
    expect(normalizeBarcode(" 560-123 45 ")).toBe("56012345");
    expect(normalizeBarcode("ab-12")) .toBe("AB12");
    expect(normalizeBarcode(" -- ")).toBeNull();
  });

  it("normalizes supported measurements", () => {
    expect(parsePackageMeasurement("75 cl")).toEqual({ quantity: "750", unit: "ml" });
    expect(parsePackageMeasurement("1,5 l")).toEqual({ quantity: "1.5", unit: "l" });
    expect(parsePackageMeasurement(undefined, 6, "units")).toEqual({ quantity: "6", unit: "un" });
    expect(parsePackageMeasurement("unknown")).toBeNull();
  });
});
