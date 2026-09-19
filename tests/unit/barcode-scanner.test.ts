import { BarcodeFormat } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { describe, expect, it } from "vitest";
import {
  classifyScannerStartError,
  createNativeBarcodeDetector,
  createProductBarcodeHints,
  DEFAULT_BARCODE_SCANNER_SETTINGS,
  getProductCameraConstraints,
  isRoutineDecodeMiss,
  normalizeBarcodeScannerSettings,
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

  it("uses higher ideal resolution in precise mode", () => {
    expect(getProductCameraConstraints(DEFAULT_BARCODE_SCANNER_SETTINGS)).toMatchObject({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    expect(getProductCameraConstraints({ mode: "fast", nativeDetector: true, highResolution: true })).toEqual(PRODUCT_CAMERA_CONSTRAINTS);
    expect(getProductCameraConstraints({ mode: "precise", nativeDetector: true, highResolution: false })).toEqual(PRODUCT_CAMERA_CONSTRAINTS);
  });

  it("normalizes persisted scanner settings", () => {
    expect(normalizeBarcodeScannerSettings(null)).toEqual(DEFAULT_BARCODE_SCANNER_SETTINGS);
    expect(normalizeBarcodeScannerSettings({ mode: "fast", nativeDetector: false, highResolution: false })).toEqual({
      mode: "fast",
      nativeDetector: false,
      highResolution: false,
    });
    expect(normalizeBarcodeScannerSettings({ mode: "unexpected" })).toEqual(DEFAULT_BARCODE_SCANNER_SETTINGS);
  });

  it("creates the native detector only when the browser provides it", () => {
    expect(createNativeBarcodeDetector({} as typeof globalThis)).toBeNull();
    expect(createNativeBarcodeDetector({
      BarcodeDetector: class {
        formats: string[];
        constructor(options: { formats: string[] }) {
          this.formats = options.formats;
        }
        async detect() {
          return [];
        }
      },
    } as unknown as typeof globalThis)).not.toBeNull();
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
