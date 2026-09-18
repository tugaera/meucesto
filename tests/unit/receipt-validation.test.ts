import { describe, expect, it } from "vitest";
import { detectReceiptMime, isSafeUploadFilename, validateReceiptDimensions, validateReceiptEnvelope } from "@/lib/receipts/validation";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("receipt upload validation", () => {
  it("detects supported formats by magic bytes", () => {
    expect(detectReceiptMime(jpeg)).toBe("image/jpeg");
    expect(detectReceiptMime(png)).toBe("image/png");
    expect(detectReceiptMime(webp)).toBe("image/webp");
    expect(detectReceiptMime(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it("rejects unsafe filenames", () => {
    expect(isSafeUploadFilename("receipt.jpg")).toBe(true);
    expect(isSafeUploadFilename("../receipt.jpg")).toBe(false);
    expect(isSafeUploadFilename("folder/receipt.jpg")).toBe(false);
    expect(isSafeUploadFilename("receipt\u0000.jpg")).toBe(false);
  });

  it("requires the declared MIME type to match the bytes and size limit", () => {
    expect(validateReceiptEnvelope({ filename: "receipt.jpg", declaredMime: "image/jpeg", bytes: jpeg, maxBytes: 10 })).toBe("image/jpeg");
    expect(() => validateReceiptEnvelope({ filename: "receipt.png", declaredMime: "image/png", bytes: jpeg, maxBytes: 10 })).toThrow("RECEIPT_INVALID");
    expect(() => validateReceiptEnvelope({ filename: "receipt.jpg", declaredMime: "image/jpeg", bytes: jpeg, maxBytes: 3 })).toThrow("RECEIPT_TOO_LARGE");
  });

  it("rejects oversized, malformed, and multi-page image dimensions", () => {
    expect(validateReceiptDimensions({ width: 2_400, height: 3_600, pages: 1 })).toEqual({ width: 2_400, height: 3_600 });
    expect(() => validateReceiptDimensions({ width: 12_001, height: 100 })).toThrow("RECEIPT_DIMENSIONS_INVALID");
    expect(() => validateReceiptDimensions({ width: 0, height: 100 })).toThrow("RECEIPT_DIMENSIONS_INVALID");
    expect(() => validateReceiptDimensions({ width: 100, height: 100, pages: 2 })).toThrow("RECEIPT_DIMENSIONS_INVALID");
  });
});
