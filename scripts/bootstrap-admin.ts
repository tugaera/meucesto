import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { z } from "zod";
import type { Database } from "../src/types/database.ts";

config({ path: ".env.local", override: false, quiet: true });

const environment = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
}).parse(process.env);

const args = process.argv.slice(2);
const valueAfter = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const email = valueAfter("--email")?.trim().toLowerCase();
const suppliedUserId = valueAfter("--user-id")?.trim();
const breakGlass = args.includes("--break-glass");

if (Boolean(email) === Boolean(suppliedUserId)) {
  throw new Error("Provide exactly one of --email or --user-id");
}

const client = createClient<Database>(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resolveUserId(): Promise<string> {
  if (suppliedUserId) return z.uuid().parse(suppliedUserId);
  for (let page = 1; page <= 100; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const match = result.data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) {
      if (!match.email_confirmed_at) throw new Error("The target Auth user is not confirmed");
      return match.id;
    }
    if (result.data.users.length < 1000) break;
  }
  throw new Error("No confirmed Auth user matched the supplied email");
}

const userId = await resolveUserId();
const result = await client.rpc("bootstrap_first_admin", { target_user_id: userId, allow_break_glass: breakGlass });
if (result.error) throw result.error;

process.stdout.write(`Admin bootstrap completed for user ${userId}${breakGlass ? " with break-glass authorization" : ""}.\n`);
