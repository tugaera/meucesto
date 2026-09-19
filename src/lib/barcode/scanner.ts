import { BarcodeFormat } from "@zxing/browser";
import { ChecksumException, DecodeHintType, FormatException, NotFoundException } from "@zxing/library";

export type ScannerStartError = "permission" | "no-camera" | "busy" | "unsupported" | "unknown";
export type BarcodeScannerMode = "fast" | "precise";

export type BarcodeScannerSettings = {
  mode: BarcodeScannerMode;
  nativeDetector: boolean;
  highResolution: boolean;
};

export const BARCODE_SCANNER_SETTINGS_KEY = "meu-cesto.barcode-scanner.settings.v1";

export const DEFAULT_BARCODE_SCANNER_SETTINGS: BarcodeScannerSettings = {
  mode: "precise",
  nativeDetector: true,
  highResolution: true,
};

export const PRODUCT_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
] as const;

const FAST_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

const PRECISE_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

export const PRODUCT_CAMERA_CONSTRAINTS = FAST_CAMERA_CONSTRAINTS;

export const NATIVE_BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
] as const;

export type NativeBarcodeDetectorResult = {
  rawValue?: string;
};

export type NativeBarcodeDetector = {
  detect(source: HTMLVideoElement): Promise<NativeBarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => NativeBarcodeDetector;

type BarcodeDetectorGlobal = typeof globalThis & {
  BarcodeDetector?: BarcodeDetectorConstructor & {
    getSupportedFormats?: () => Promise<string[]>;
  };
};

export function normalizeBarcodeScannerSettings(value: unknown): BarcodeScannerSettings {
  if (!value || typeof value !== "object") return DEFAULT_BARCODE_SCANNER_SETTINGS;
  const candidate = value as Partial<BarcodeScannerSettings>;
  return {
    mode: candidate.mode === "fast" ? "fast" : "precise",
    nativeDetector: candidate.nativeDetector !== false,
    highResolution: candidate.highResolution !== false,
  };
}

export function getProductCameraConstraints(settings: BarcodeScannerSettings): MediaStreamConstraints {
  if (settings.mode === "precise" && settings.highResolution) return PRECISE_CAMERA_CONSTRAINTS;
  return FAST_CAMERA_CONSTRAINTS;
}

export function createProductBarcodeHints(): Map<DecodeHintType, unknown> {
  return new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [...PRODUCT_BARCODE_FORMATS]],
  ]);
}

export function createNativeBarcodeDetector(root: BarcodeDetectorGlobal = globalThis): NativeBarcodeDetector | null {
  if (!root.BarcodeDetector) return null;
  try {
    return new root.BarcodeDetector({ formats: [...NATIVE_BARCODE_FORMATS] });
  } catch {
    return null;
  }
}

export function isRoutineDecodeMiss(error: unknown): boolean {
  if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) return true;
  const name = error instanceof Error ? error.name : typeof error === "object" && error && "name" in error ? String(error.name) : "";
  return name === "NotFoundException" || name === "ChecksumException" || name === "FormatException";
}

export function classifyScannerStartError(error: unknown): ScannerStartError {
  const name = error instanceof Error ? error.name : typeof error === "object" && error && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "permission";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "no-camera";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  if (name === "TypeError") return "unsupported";
  return "unknown";
}

type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[] };
type FocusConstraint = MediaTrackConstraintSet & { focusMode: "continuous" };

export async function enableContinuousFocus(video: HTMLVideoElement): Promise<void> {
  if (!(video.srcObject instanceof MediaStream)) return;
  const track = video.srcObject.getVideoTracks()[0];
  if (!track) return;
  const capabilities = track.getCapabilities() as FocusCapabilities;
  if (!capabilities.focusMode?.includes("continuous")) return;
  await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as FocusConstraint] });
}

export function stopVideoStream(video: HTMLVideoElement | null): void {
  if (!video || !(video.srcObject instanceof MediaStream)) return;
  for (const track of video.srcObject.getTracks()) track.stop();
  video.srcObject = null;
}
