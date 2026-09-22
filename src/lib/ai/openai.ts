import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ReceiptMimeType } from "@/lib/receipts/validation";
import { RECEIPT_SYSTEM_PROMPT, RECEIPT_USER_PROMPT } from "./prompt";
import { AiProviderError, receiptExtractionSchema, type ProviderExtractionResult } from "./types";

export async function extractWithOpenAi(input: { apiKey: string; model: string; bytes: Uint8Array; mimeType: ReceiptMimeType; timeoutMs: number }): Promise<ProviderExtractionResult> {
  const client = new OpenAI({ apiKey: input.apiKey, maxRetries: 0, timeout: input.timeoutMs });
  try {
    const imageUrl = `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;
    const response = await client.responses.parse({
      model: input.model,
      instructions: RECEIPT_SYSTEM_PROMPT,
      input: [{ role: "user", content: [
        { type: "input_text", text: RECEIPT_USER_PROMPT },
        { type: "input_image", image_url: imageUrl, detail: "high" },
      ] }],
      text: { format: zodTextFormat(receiptExtractionSchema, "receipt_extraction") },
      max_output_tokens: 4_096,
      store: false,
    });
    const proposal = receiptExtractionSchema.safeParse(response.output_parsed);
    if (!proposal.success) throw new AiProviderError("openai", "non_retriable", "AI_INVALID_RESPONSE");
    return { proposal: proposal.data, providerRequestId: response.id };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof OpenAI.APIConnectionTimeoutError) throw new AiProviderError("openai", "ambiguous", "AI_AMBIGUOUS_TIMEOUT");
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) throw new AiProviderError("openai", "quota", "AI_PROVIDER_QUOTA");
      if ([500, 502, 503].includes(error.status ?? 0)) throw new AiProviderError("openai", "retriable", "AI_PROVIDER_RETRIABLE");
    }
    throw new AiProviderError("openai", "non_retriable", "AI_PROVIDER_FAILED");
  }
}
