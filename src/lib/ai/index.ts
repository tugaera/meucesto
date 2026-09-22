import "server-only";

import type { ServerEnvironment } from "@/lib/env/server";
import type { ReceiptMimeType } from "@/lib/receipts/validation";
import { extractWithAnthropic } from "./anthropic";
import { extractWithOpenAi } from "./openai";
import { AiProviderError, type AiProviderName, type ProviderExtractionResult } from "./types";

interface ProviderStatus {
  requestId: string;
  provider: AiProviderName;
  status: "started" | "completed" | "failed" | "ambiguous";
  providerRequestId?: string;
  errorCode?: string;
}

type RecordProviderStatus = (status: ProviderStatus) => Promise<void>;

async function runProvider(
  provider: AiProviderName,
  request: () => Promise<ProviderExtractionResult>,
  record: RecordProviderStatus,
): Promise<{ result: ProviderExtractionResult; requestId: string }> {
  const requestId = crypto.randomUUID();
  await record({ requestId, provider, status: "started" });
  try {
    const result = await request();
    await record({ requestId, provider, status: "completed", providerRequestId: result.providerRequestId });
    return { result, requestId };
  } catch (error) {
    const providerError = error instanceof AiProviderError ? error : new AiProviderError(provider, "non_retriable", "AI_PROVIDER_FAILED");
    await record({ requestId, provider, status: providerError.classification === "ambiguous" ? "ambiguous" : "failed", errorCode: providerError.errorCode });
    throw providerError;
  }
}

export async function extractReceipt(
  input: { bytes: Uint8Array; mimeType: ReceiptMimeType },
  environment: ServerEnvironment,
  record: RecordProviderStatus,
): Promise<{ result: ProviderExtractionResult; requestId: string; provider: AiProviderName }> {
  const anthropicKey = environment.ANTHROPIC_API_KEY;
  const anthropicModel = environment.ANTHROPIC_MODEL;
  const openAiKey = environment.OPENAI_API_KEY;
  const openAiModel = environment.OPENAI_MODEL;
  const timeoutMs = environment.AI_PROVIDER_TIMEOUT_MS;
  if (anthropicKey && anthropicModel) {
    try {
      const anthropic = await runProvider("anthropic", () => extractWithAnthropic({ apiKey: anthropicKey, model: anthropicModel, timeoutMs, ...input }), record);
      return { ...anthropic, provider: "anthropic" };
    } catch (error) {
      const fallbackAllowed = error instanceof AiProviderError && error.classification === "retriable";
      if (!fallbackAllowed || !openAiKey || !openAiModel) throw error;
    }
  }
  if (openAiKey && openAiModel) {
    const openai = await runProvider("openai", () => extractWithOpenAi({ apiKey: openAiKey, model: openAiModel, timeoutMs, ...input }), record);
    return { ...openai, provider: "openai" };
  }
  throw new AiProviderError("anthropic", "non_retriable", "AI_UNAVAILABLE");
}
