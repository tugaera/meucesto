import { BarcodeFormat } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { describe, expect, it } from "vitest";
import {
  classifyScannerStartError,
  createProductBarcodeHints,
  isRoutineDecodeMiss,
  PRODUCT_CAMERA_CONSTRAINTS,
} from "@/lib/barcode/scanner";

describe("barcode scanner configuration", () => {
  it("prioritizes common retail formats without ZXing's broken rotation path", () => {
    const hints = createProductBarcodeHints();
    const formats = hints.get(DecodeHintType.POSSIBLE_FORMATS);

    expect(hints.has(DecodeHintType.TRY_HARDER)).toBe(false);
    expect(formats).toEqual(expect.arrayContaining([
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ]));
  });

  it("requests the rear camera at a useful ideal resolution", () => {
    expect(PRODUCT_CAMERA_CONSTRAINTS).toMatchObject({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  });

  it.each([
    ["NotAllowedError", "permission"],
    ["NotFoundError", "no-camera"],
    ["OverconstrainedError", "no-camera"],
    ["NotReadableError", "busy"],
    ["TypeError", "unsupported"],
    ["UnexpectedError", "unknown"],
  ] as const)("maps %s camera failures to %s", (name, expected) => {
    expect(classifyScannerStartError({ name })).toBe(expected);
  });

  it.each(["NotFoundException", "ChecksumException", "FormatException"])("keeps scanning after %s", (name) => {
    expect(isRoutineDecodeMiss({ name })).toBe(true);
  });

  it("does not hide an unexpected decoder failure", () => {
    expect(isRoutineDecodeMiss({ name: "UnexpectedError" })).toBe(false);
  });
});
