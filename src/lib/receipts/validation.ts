export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReceiptMimeType = typeof RECEIPT_MIME_TYPES[number];
export const MAX_RECEIPT_DIMENSION = 12_000;
export const MAX_RECEIPT_PIXELS = MAX_RECEIPT_DIMENSION * MAX_RECEIPT_DIMENSION;

export function detectReceiptMime(bytes: Uint8Array): ReceiptMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function isSafeUploadFilename(filename: string): boolean {
  const trimmed = filename.trim();
  return Boolean(trimmed)
    && trimmed.length <= 255
    && !trimmed.includes("..")
    && !trimmed.includes("/")
    && !trimmed.includes("\\")
    && !/[\u0000-\u001f\u007f]/.test(trimmed);
}

export function validateReceiptEnvelope(input: { filename: string; declaredMime: string; bytes: Uint8Array; maxBytes: number }): ReceiptMimeType {
  if (!isSafeUploadFilename(input.filename)) throw new Error("RECEIPT_INVALID");
  if (input.bytes.length === 0) throw new Error("RECEIPT_INVALID");
  if (input.bytes.length > input.maxBytes) throw new Error("RECEIPT_TOO_LARGE");
  const detected = detectReceiptMime(input.bytes);
  if (!detected || detected !== input.declaredMime) throw new Error("RECEIPT_INVALID");
  return detected;
}

export function validateReceiptDimensions(input: { width?: number; height?: number; pages?: number }): { width: number; height: number } {
  const { width, height, pages = 1 } = input;
  if (!width || !height || !Number.isInteger(width) || !Number.isInteger(height)
    || width > MAX_RECEIPT_DIMENSION || height > MAX_RECEIPT_DIMENSION
    || width * height > MAX_RECEIPT_PIXELS || pages !== 1) {
    throw new Error("RECEIPT_DIMENSIONS_INVALID");
  }
  return { width, height };
}
