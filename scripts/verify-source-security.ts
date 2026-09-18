import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function sourceFiles(directory: string): string[] {
  const absolute = resolve(root, directory);
  return readdirSync(absolute).flatMap((entry) => {
    const path = resolve(absolute, entry);
    if (statSync(path).isDirectory()) return sourceFiles(relative(root, path));
    return /\.(?:ts|tsx)$/.test(path) ? [path] : [];
  });
}

const applicationFiles = sourceFiles("src");

for (const path of applicationFiles) {
  const source = readFileSync(path, "utf8");
  const label = relative(root, path).replaceAll("\\", "/");
  if (/\@ts-(?:ignore|nocheck)/.test(source)) fail(`${label}: TypeScript suppression is forbidden`);
  if (/\b(?:as|<)\s*any\b/.test(source) || /:\s*any\b/.test(source)) fail(`${label}: explicit any is forbidden`);

  if (/^\s*["']use client["'];/m.test(source)) {
    const secretNames = /\b(?:SUPABASE_SECRET_KEY|EMAIL_API_KEY|EMAIL_SMTP_PASSWORD|ANTHROPIC_API_KEY|OPENAI_API_KEY|RATE_LIMIT_HASH_SECRET)\b/;
    if (secretNames.test(source)) fail(`${label}: client module references a server secret`);
    if (/from\s+["']@\/lib\/(?:env\/server|supabase\/admin)["']/.test(source)) fail(`${label}: client module imports a server-only module`);
  }

  const directTable = source.match(/\.from\(\s*["'](profiles|invites|shopping_carts|shopping_cart_items|shopping_lists|shopping_list_items|cart_shares|list_shares|audit_log|mutation_receipts)["']\s*\)/);
  if (directTable) fail(`${label}: protected table ${directTable[1]} must be accessed through an RPC`);
}

for (const serverOnlyPath of [
  "src/lib/env/server.ts",
  "src/lib/supabase/admin.ts",
  "src/lib/ai/index.ts",
  "src/lib/email/index.ts",
  "src/lib/barcode/open-food-facts.ts",
]) {
  const source = readFileSync(resolve(root, serverOnlyPath), "utf8");
  if (!source.startsWith('import "server-only";')) fail(`${serverOnlyPath}: missing server-only boundary`);
}

const schema = readFileSync(resolve(root, "supabase/schema.sql"), "utf8");
const definerCount = schema.match(/security definer/gi)?.length ?? 0;
const hardenedDefinerCount = schema.match(/security definer\s+set search_path = ''/gi)?.length ?? 0;
if (definerCount === 0 || hardenedDefinerCount !== definerCount) fail("supabase/schema.sql: every security-definer function must set an empty search_path");

for (const table of [
  "profiles", "invites", "stores", "categories", "brands", "units", "products", "product_entries",
  "shopping_lists", "shopping_list_items", "shopping_carts", "shopping_cart_items", "cart_shares", "list_shares",
  "resource_join_invites", "cart_receipt_images", "mutation_receipts", "request_rate_limits", "ai_usage_daily",
  "ai_provider_requests", "audit_log", "retention_queue",
]) {
  if (!schema.includes(`alter table public.${table} enable row level security;`)) fail(`supabase/schema.sql: RLS is not enabled for public.${table}`);
}

if (!schema.includes("revoke all privileges on all functions in schema public from public, anon, authenticated;")) fail("supabase/schema.sql: default function execution is not revoked");
if (/grant execute on function[^;]+to\s+(?:public|anon)\s*;/i.test(schema)) fail("supabase/schema.sql: a function is executable by public or anon");
if (!/values \('receipts', 'receipts', false, 5242880, array\['image\/jpeg','image\/png','image\/webp'\]\)/.test(schema)) fail("supabase/schema.sql: receipts bucket must be private and MIME-limited");
if (!schema.includes("alter table realtime.messages enable row level security;")) fail("supabase/schema.sql: Realtime authorization is missing");
for (const policy of ["realtime_cart_receive", "realtime_cart_send", "realtime_list_receive", "realtime_list_send"]) {
  if (!schema.includes(`create policy ${policy} on realtime.messages`)) fail(`supabase/schema.sql: missing ${policy}`);
}
if (!schema.includes("metadata::text !~* '\"(password|token|invite_code|ocr_text|receipt_text|provider_payload)\"\\s*:'")) fail("supabase/schema.sql: audit metadata secret guard is missing");

const serviceWorker = readFileSync(resolve(root, "src/app/sw.ts"), "utf8");
for (const marker of ["new NetworkOnly()", 'url.pathname.startsWith("/auth/")', 'url.pathname.startsWith("/api/")', 'url.hostname.endsWith(".supabase.co")']) {
  if (!serviceWorker.includes(marker)) fail(`src/app/sw.ts: sensitive request guard is missing ${marker}`);
}
const receiptActions = readFileSync(resolve(root, "src/features/history/receipt-actions.ts"), "utf8");
if (!receiptActions.includes('cacheControl: "0"')) fail("receipt signed content must not be cached");
if (!receiptActions.includes("RECEIPT_SIGNED_URL_TTL_SECONDS")) fail("receipt signed URLs must use the configured short TTL");

if (failures.length > 0) {
  console.error(`Security verification failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Security verification passed (${applicationFiles.length} source files, ${definerCount} hardened functions).`);
