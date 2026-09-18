import { z } from "zod";

const exactOrigin = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    context.addIssue({ code: "custom", message: "Site URL must be an exact origin without a path, query, credentials, or fragment" });
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    context.addIssue({ code: "custom", message: "Site URL must use HTTPS in production" });
  }
});

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine((value) => value.startsWith("https://") || value.startsWith("http://127.0.0.1"), "Supabase URL must use HTTPS outside local development"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: exactOrigin,
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

let cachedEnvironment: PublicEnvironment | undefined;

export function getPublicEnvironment(): PublicEnvironment {
  cachedEnvironment ??= publicEnvironmentSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return cachedEnvironment;
}
