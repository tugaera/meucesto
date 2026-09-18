import { BarcodeFormat } from "@zxing/browser";
import { ChecksumException, DecodeHintType, FormatException, NotFoundException } from "@zxing/library";

export type ScannerStartError = "permission" | "no-camera" | "busy" | "unsupported" | "unknown";

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

export const PRODUCT_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

export function createProductBarcodeHints(): Map<DecodeHintType, unknown> {
  return new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [...PRODUCT_BARCODE_FORMATS]],
  ]);
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
