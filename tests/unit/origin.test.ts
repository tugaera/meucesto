import { describe, expect, it } from "vitest";
import { isSafeRelativeRedirect, isTrustedRequestOrigin } from "@/lib/security/origin";

describe("request origin and redirect validation", () => {
  it("only accepts the exact configured origin", () => {
    expect(isTrustedRequestOrigin("https://app.example.com", "https://app.example.com")).toBe(true);
    expect(isTrustedRequestOrigin("https://app.example.com.evil.test", "https://app.example.com")).toBe(false);
    expect(isTrustedRequestOrigin("https://app.example.com/path", "https://app.example.com")).toBe(false);
    expect(isTrustedRequestOrigin(null, "https://app.example.com")).toBe(false);
  });

  it("allows only explicitly listed relative destinations", () => {
    const allowed = new Set(["/shopping", "/lists"]);
    expect(isSafeRelativeRedirect("/lists", allowed, "/shopping")).toBe("/lists");
    expect(isSafeRelativeRedirect("//evil.test", allowed, "/shopping")).toBe("/shopping");
    expect(isSafeRelativeRedirect("/admin", allowed, "/shopping")).toBe("/shopping");
  });
});
