import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ReceiptMimeType } from "@/lib/receipts/validation";
import { RECEIPT_SYSTEM_PROMPT, RECEIPT_USER_PROMPT } from "./prompt";
import { AiProviderError, receiptExtractionSchema, type ProviderExtractionResult } from "./types";

export async function extractWithAnthropic(input: { apiKey: string; model: string; bytes: Uint8Array; mimeType: ReceiptMimeType }): Promise<ProviderExtractionResult> {
  const client = new Anthropic({ apiKey: input.apiKey, maxRetries: 0, timeout: 20_000 });
  try {
    const message = await client.messages.parse({
      model: input.model,
      max_tokens: 4_096,
      system: RECEIPT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: input.mimeType, data: Buffer.from(input.bytes).toString("base64") } },
        { type: "text", text: RECEIPT_USER_PROMPT },
      ] }],
      output_config: { format: zodOutputFormat(receiptExtractionSchema) },
    });
    const proposal = receiptExtractionSchema.safeParse(message.parsed_output);
    if (!proposal.success) throw new AiProviderError("anthropic", "non_retriable", "AI_INVALID_RESPONSE");
    return { proposal: proposal.data, providerRequestId: message.id };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AiProviderError("anthropic", "ambiguous", "AI_AMBIGUOUS_TIMEOUT");
    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) throw new AiProviderError("anthropic", "quota", "AI_PROVIDER_QUOTA");
      if ([500, 502, 503, 529].includes(error.status ?? 0)) throw new AiProviderError("anthropic", "retriable", "AI_PROVIDER_RETRIABLE");
    }
    throw new AiProviderError("anthropic", "non_retriable", "AI_PROVIDER_FAILED");
  }
}
