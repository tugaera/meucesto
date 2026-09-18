export const KNOWN_ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "NOT_AUTHORIZED",
  "RESOURCE_NOT_FOUND",
  "CART_FINALIZED",
  "REVISION_CONFLICT",
  "INVITE_INVALID_OR_UNAVAILABLE",
  "TOKEN_INVALID_OR_UNAVAILABLE",
  "RATE_LIMITED",
  "VALIDATION_ERROR",
  "SHARE_TARGET_UNAVAILABLE",
  "INVITE_TARGET_UNAVAILABLE",
  "STORE_REQUIRED",
  "FINAL_ADMIN_REQUIRED",
  "AI_DAILY_LIMIT_REACHED",
  "AI_CONSENT_REQUIRED",
  "AI_UNAVAILABLE",
  "AI_INVALID_RESPONSE",
  "AI_AMBIGUOUS_TIMEOUT",
  "AI_PROVIDER_QUOTA",
  "AI_PROVIDER_RETRIABLE",
  "AI_PROVIDER_FAILED",
  "EMAIL_UNAVAILABLE",
  "RECEIPT_INVALID",
  "RECEIPT_TOO_LARGE",
  "RECEIPT_DIMENSIONS_INVALID",
  "CURRENT_PASSWORD_INVALID",
  "PASSWORD_UPDATE_FAILED",
  "ACCOUNT_DELETE_FAILED",
  "AUTH_EMAIL_ALREADY_REGISTERED",
  "AUTH_HOOK_FAILED",
  "EMAIL_DELIVERY_FAILED",
  "RESOURCE_IN_USE",
  "RESOURCE_IN_USE_OR_NOT_FOUND",
  "DEFAULT_UNIT_REQUIRED",
] as const;

const knownErrorCodes = new Set<string>(KNOWN_ERROR_CODES);

export function toErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    for (const code of knownErrorCodes) {
      if (message.includes(code)) return code;
    }
  }
  return "UNKNOWN";
}
