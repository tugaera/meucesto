export function isTrustedRequestOrigin(originHeader: string | null, siteUrl: string): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(siteUrl).origin && new URL(originHeader).pathname === "/";
  } catch {
    return false;
  }
}

export function isSafeRelativeRedirect(value: string | null, allowed: ReadonlySet<string>, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || !allowed.has(value)) return fallback;
  return value;
}
