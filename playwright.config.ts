import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start --port ${port}`,
    url: `${baseURL}/auth/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_e2e_placeholder_key",
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? "sb_secret_e2e_placeholder_key_000000",
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "https://meucesto.example.com",
      EMAIL_PROVIDER: process.env.EMAIL_PROVIDER ?? "disabled",
      EMAIL_FROM: process.env.EMAIL_FROM ?? "Meu Cesto <noreply@meucesto.example.com>",
      OPENFOODFACTS_USER_AGENT: process.env.OPENFOODFACTS_USER_AGENT ?? "MeuCesto/1.0 (meucesto@webmails.org)",
      RATE_LIMIT_HASH_SECRET: process.env.RATE_LIMIT_HASH_SECRET ?? "e2e-only-secret-with-at-least-32-characters",
    },
  },
});
