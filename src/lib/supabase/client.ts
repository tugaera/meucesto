"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnvironment } from "@/lib/env/public";
import type { Database } from "@/types/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient(): ReturnType<typeof createBrowserClient<Database>> {
  const environment = getPublicEnvironment();
  browserClient ??= createBrowserClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return browserClient;
}
