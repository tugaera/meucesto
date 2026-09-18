import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { APP_VERSION } from "../../src/generated/app-version";

const publicPages = ["/auth/login", "/auth/signup?code=ABCD1234", "/auth/forgot-password", "/privacy", "/changelog", "/offline"];

test("login exposes the synchronized release and switches locale", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("heading", { level: 1, name: "Bem-vindo de volta" })).toBeVisible();
  const versionLink = page.getByRole("link", { name: `Ver alterações da versão ${APP_VERSION}` });
  await expect(versionLink).toHaveText(`Meu Cesto v${APP_VERSION}`);
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("link", { name: `View changes for version ${APP_VERSION}` })).toBeVisible();
});

test("public pages have no serious accessibility violations", async ({ page }) => {
  test.setTimeout(90_000);
  for (const path of publicPages) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const important = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(important, `${path}: ${important.map((violation) => violation.id).join(", ")}`).toEqual([]);
  }
});

test("security headers and manifest are present", async ({ page, request }) => {
  const response = await page.goto("/privacy");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  await expect(manifest.json()).resolves.toMatchObject({ name: "Meu Cesto", start_url: "/shopping", display: "standalone" });
});

test("production service worker only populates static caches", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Service worker contract is verified in Chromium");
  await page.goto("/offline");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await fetch("/icon-192.png");
  });
  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return entries.flat().map((request) => request.url);
  });
  const cachedPaths = cachedUrls.map((url) => new URL(url).pathname);
  expect(cachedPaths.some((path) => path.startsWith("/auth/") || path.startsWith("/api/"))).toBe(false);
  expect(cachedUrls.some((url) => new URL(url).hostname.endsWith(".supabase.co"))).toBe(false);
  expect(cachedPaths).toContain("/icon-192.png");
  await context.clearCookies();
});
