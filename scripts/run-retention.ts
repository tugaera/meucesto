import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { z } from "zod";
import type { Database } from "../src/types/database.ts";

config({ path: ".env.local", override: false, quiet: true });

const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.url().optional());
const environment = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  INVITE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  AUDIT_RETENTION_MONTHS: z.coerce.number().int().min(1).max(120).default(12),
  AUDIT_ARCHIVE_URL: optionalUrl,
  AUDIT_ARCHIVE_BEARER_TOKEN: z.string().min(1).optional(),
  RECEIPT_ORPHAN_GRACE_HOURS: z.coerce.number().int().min(1).max(720).default(24),
}).parse(process.env);

const client = createClient<Database>(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const jobSchema = z.object({ id: z.uuid(), jobType: z.literal("receipt_object_purge"), objectPaths: z.array(z.string()) });

async function purgeDueReceiptJobs(): Promise<number> {
  const result = await client.rpc("get_due_retention_jobs", { page_size: 100 });
  if (result.error) throw result.error;
  const jobs = z.array(jobSchema).parse(result.data);
  for (const job of jobs) {
    const removal = job.objectPaths.length ? await client.storage.from("receipts").remove(job.objectPaths) : { error: null };
    const completion = await client.rpc("complete_retention_job", {
      job_id: job.id,
      succeeded: !removal.error,
      ...(removal.error ? { error_code: "STORAGE_DELETE_FAILED" } : {}),
    });
    if (completion.error) throw completion.error;
  }
  return jobs.length;
}

async function archiveDueAudit(cutoff: string): Promise<number> {
  if (!environment.AUDIT_ARCHIVE_URL) return 0;
  let offset = 0;
  let archived = 0;
  while (true) {
    const result = await client.from("audit_log").select("id,actor_user_id,action,entity_type,entity_id,metadata,created_at").lt("created_at", cutoff).order("created_at").order("id").range(offset, offset + 499);
    if (result.error) throw result.error;
    if (!result.data.length) break;
    const response = await fetch(environment.AUDIT_ARCHIVE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(environment.AUDIT_ARCHIVE_BEARER_TOKEN ? { Authorization: `Bearer ${environment.AUDIT_ARCHIVE_BEARER_TOKEN}` } : {}),
      },
      body: JSON.stringify({ schemaVersion: 1, cutoff, events: result.data }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Audit archive rejected batch with status ${response.status}`);
    archived += result.data.length;
    offset += result.data.length;
    if (result.data.length < 500) break;
  }
  return archived;
}

interface StorageObject { name: string; id: string | null; created_at?: string | null }

async function listFolder(prefix: string): Promise<StorageObject[]> {
  const found: StorageObject[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await client.storage.from("receipts").list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (result.error) throw result.error;
    found.push(...result.data);
    if (result.data.length < 1000) break;
  }
  return found;
}

async function reconcileReceiptOrphans(): Promise<number> {
  const paths = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const result = await client.from("cart_receipt_images").select("object_path").order("object_path").range(offset, offset + 999);
    if (result.error) throw result.error;
    const rows = z.array(z.object({ object_path: z.string() })).parse(result.data);
    rows.forEach((row) => paths.add(row.object_path));
    if (rows.length < 1000) break;
  }

  const cutoff = Date.now() - environment.RECEIPT_ORPHAN_GRACE_HOURS * 60 * 60 * 1000;
  const orphanPaths: string[] = [];
  for (const userFolder of await listFolder("")) {
    if (userFolder.id) continue;
    for (const cartFolder of await listFolder(userFolder.name)) {
      if (cartFolder.id) continue;
      const prefix = `${userFolder.name}/${cartFolder.name}`;
      for (const object of await listFolder(prefix)) {
        if (!object.id) continue;
        const path = `${prefix}/${object.name}`;
        const createdAt = object.created_at ? new Date(object.created_at).valueOf() : Number.POSITIVE_INFINITY;
        if (!paths.has(path) && createdAt < cutoff) orphanPaths.push(path);
      }
    }
  }

  for (let index = 0; index < orphanPaths.length; index += 100) {
    const removal = await client.storage.from("receipts").remove(orphanPaths.slice(index, index + 100));
    if (removal.error) throw removal.error;
  }
  return orphanPaths.length;
}

const cutoffDate = new Date();
cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - environment.AUDIT_RETENTION_MONTHS);
const cutoff = cutoffDate.toISOString();
const receiptJobs = await purgeDueReceiptJobs();
const archivedAuditEvents = await archiveDueAudit(cutoff);
const purged = await client.rpc("purge_operational_data", {
  invite_retention_days: environment.INVITE_RETENTION_DAYS,
  audit_retention_months: environment.AUDIT_RETENTION_MONTHS,
  delete_due_audit: true,
});
if (purged.error) throw purged.error;
const orphanReceipts = await reconcileReceiptOrphans();

process.stdout.write(`${JSON.stringify({ receiptJobs, archivedAuditEvents, orphanReceipts, purged: purged.data })}\n`);
