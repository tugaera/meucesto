const allowedAuthDestinations = new Set(["/shopping", "/auth/reset-password"]);

export function safeAuthDestination(value: string | null, fallback = "/shopping"): string {
  if (!value || !allowedAuthDestinations.has(value)) return fallback;
  return value;
}
