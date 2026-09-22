import "server-only";

import { z } from "zod";
import { getPublicEnvironment } from "./public";

const optionalSecret = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());

const serverEnvironmentSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
  OPENFOODFACTS_USER_AGENT: z.string().min(12).regex(/\([^()\s]+@[^()\s]+\)/),
  EMAIL_PROVIDER: z.enum(["disabled", "resend", "smtp"]).default("disabled"),
  EMAIL_FROM: z.string().min(3),
  EMAIL_API_KEY: optionalSecret,
  EMAIL_SMTP_HOST: optionalSecret,
  EMAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  EMAIL_SMTP_SECURE: z.stringbool().default(false),
  EMAIL_SMTP_USER: optionalSecret,
  EMAIL_SMTP_PASSWORD: optionalSecret,
  RECEIPT_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  RECEIPT_MAX_BYTES: z.coerce.number().int().min(1024).max(5_242_880).default(5_242_880),
  RECEIPT_ALLOW_LIBRARY_UPLOADS: z.stringbool().default(false),
  RATE_LIMIT_HASH_SECRET: z.string().min(32),
  INVITE_VALIDATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(10),
  PASSWORD_RESET_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
  AI_OCR_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  AI_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(20_000).max(110_000).default(90_000),
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: optionalSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: optionalSecret,
  RECEIPT_DELETION_GRACE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  INVITE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  AUDIT_RETENTION_MONTHS: z.coerce.number().int().min(1).max(120).default(12),
  AUDIT_ARCHIVE_URL: z.preprocess((value) => value === "" ? undefined : value, z.url().optional()),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema> & ReturnType<typeof getPublicEnvironment>;

let cachedEnvironment: ServerEnvironment | undefined;

function validateProviderConfiguration(environment: z.infer<typeof serverEnvironmentSchema>): void {
  if (environment.EMAIL_PROVIDER === "resend" && !environment.EMAIL_API_KEY) {
    throw new Error("EMAIL_API_KEY is required when EMAIL_PROVIDER=resend");
  }
  if (environment.EMAIL_PROVIDER === "smtp" && (!environment.EMAIL_SMTP_HOST || !environment.EMAIL_SMTP_USER || !environment.EMAIL_SMTP_PASSWORD)) {
    throw new Error("SMTP host, user, and password are required when EMAIL_PROVIDER=smtp");
  }
  if ((environment.ANTHROPIC_API_KEY && !environment.ANTHROPIC_MODEL) || (!environment.ANTHROPIC_API_KEY && environment.ANTHROPIC_MODEL)) {
    throw new Error("ANTHROPIC_API_KEY and ANTHROPIC_MODEL must be configured together");
  }
  if ((environment.OPENAI_API_KEY && !environment.OPENAI_MODEL) || (!environment.OPENAI_API_KEY && environment.OPENAI_MODEL)) {
    throw new Error("OPENAI_API_KEY and OPENAI_MODEL must be configured together");
  }
}

export function getServerEnvironment(): ServerEnvironment {
  if (!cachedEnvironment) {
    const serverEnvironment = serverEnvironmentSchema.parse({
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      OPENFOODFACTS_USER_AGENT: process.env.OPENFOODFACTS_USER_AGENT,
      EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
      EMAIL_FROM: process.env.EMAIL_FROM,
      EMAIL_API_KEY: process.env.EMAIL_API_KEY,
      EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
      EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT,
      EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE,
      EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER,
      EMAIL_SMTP_PASSWORD: process.env.EMAIL_SMTP_PASSWORD,
      RECEIPT_SIGNED_URL_TTL_SECONDS: process.env.RECEIPT_SIGNED_URL_TTL_SECONDS,
      RECEIPT_MAX_BYTES: process.env.RECEIPT_MAX_BYTES,
      RECEIPT_ALLOW_LIBRARY_UPLOADS: process.env.RECEIPT_ALLOW_LIBRARY_UPLOADS,
      RATE_LIMIT_HASH_SECRET: process.env.RATE_LIMIT_HASH_SECRET,
      INVITE_VALIDATION_MAX_ATTEMPTS: process.env.INVITE_VALIDATION_MAX_ATTEMPTS,
      PASSWORD_RESET_MAX_ATTEMPTS: process.env.PASSWORD_RESET_MAX_ATTEMPTS,
      AI_OCR_DAILY_LIMIT: process.env.AI_OCR_DAILY_LIMIT,
      AI_PROVIDER_TIMEOUT_MS: process.env.AI_PROVIDER_TIMEOUT_MS,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      RECEIPT_DELETION_GRACE_DAYS: process.env.RECEIPT_DELETION_GRACE_DAYS,
      INVITE_RETENTION_DAYS: process.env.INVITE_RETENTION_DAYS,
      AUDIT_RETENTION_MONTHS: process.env.AUDIT_RETENTION_MONTHS,
      AUDIT_ARCHIVE_URL: process.env.AUDIT_ARCHIVE_URL,
    });
    validateProviderConfiguration(serverEnvironment);
    cachedEnvironment = { ...getPublicEnvironment(), ...serverEnvironment };
  }
  return cachedEnvironment;
}

export function hasAiProvider(): boolean {
  const environment = getServerEnvironment();
  return Boolean(environment.ANTHROPIC_API_KEY || environment.OPENAI_API_KEY);
}
