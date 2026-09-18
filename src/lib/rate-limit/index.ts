import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getServerEnvironment } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RateLimitOptions {
  action: string;
  identity: string;
  maximumAttempts: number;
  windowSeconds?: number;
  blockSeconds?: number;
}

function normalizeAddress(value: string | null): string {
  return value?.split(",")[0]?.trim().toLowerCase() || "unknown";
}

export async function consumeRateLimit({
  action,
  identity,
  maximumAttempts,
  windowSeconds = 900,
  blockSeconds = 900,
}: RateLimitOptions): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const requestHeaders = await headers();
  const address = normalizeAddress(requestHeaders.get("x-forwarded-for") ?? requestHeaders.get("x-real-ip"));
  const environment = getServerEnvironment();
  const keyHash = createHmac("sha256", environment.RATE_LIMIT_HASH_SECRET)
    .update(`${action}\u0000${address}\u0000${identity.trim().toLowerCase()}`)
    .digest("hex");
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
    action_name: action,
    hashed_key: keyHash,
    max_attempts: maximumAttempts,
    window_seconds: windowSeconds,
    block_seconds: blockSeconds,
  });
  if (error) throw new Error("RATE_LIMITED");
  const result = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
  return {
    allowed: result.allowed === true,
    ...(typeof result.retryAfterSeconds === "number" ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
  };
}
