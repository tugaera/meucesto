import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnvironment } from "@/lib/env/server";
import type { Database } from "@/types/database";

export function createAdminClient(): ReturnType<typeof createClient<Database>> {
  const environment = getServerEnvironment();
  return createClient<Database>(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
