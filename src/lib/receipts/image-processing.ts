import "server-only";

import sharp from "sharp";
import { MAX_RECEIPT_PIXELS, validateReceiptDimensions, validateReceiptEnvelope } from "./validation";

export interface ProcessedReceipt {
  bytes: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
}

export async function processReceiptImage(file: File, maxBytes: number): Promise<ProcessedReceipt> {
  const input = Buffer.from(await file.arrayBuffer());
  validateReceiptEnvelope({ filename: file.name, declaredMime: file.type, bytes: input, maxBytes });
  let image;
  try {
    image = sharp(input, { failOn: "error", limitInputPixels: MAX_RECEIPT_PIXELS });
    const metadata = await image.metadata();
    validateReceiptDimensions({ width: metadata.width, height: metadata.height, pages: metadata.pages ?? 1 });
  } catch (error) {
    if (error instanceof Error && error.message === "RECEIPT_DIMENSIONS_INVALID") throw error;
    throw new Error("RECEIPT_INVALID");
  }
  let output = await image.rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  if (output.data.length > maxBytes) output = await sharp(input, { failOn: "error", limitInputPixels: MAX_RECEIPT_PIXELS }).rotate().jpeg({ quality: 72, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  if (output.data.length > maxBytes) throw new Error("RECEIPT_TOO_LARGE");
  return { bytes: output.data, mimeType: "image/jpeg", width: output.info.width, height: output.info.height };
}

export function createReceiptObjectPath(userId: string, cartId: string, uploadId: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(userId) || !uuid.test(cartId) || !uuid.test(uploadId)) throw new Error("RECEIPT_INVALID");
  return `${userId}/${cartId}/${uploadId}.jpg`;
}
