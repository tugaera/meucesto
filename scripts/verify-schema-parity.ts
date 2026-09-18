import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const schemaPath = resolve(root, 'supabase', 'schema.sql');
const migrationPath = resolve(root, 'supabase', 'migrations', '20260915000000_initial_schema.sql');

const normalize = (value: string): string => value.replaceAll('\r\n', '\n').trimEnd() + '\n';
const schema = normalize(readFileSync(schemaPath, 'utf8'));
const migration = normalize(readFileSync(migrationPath, 'utf8'));

if (schema !== migration) {
  throw new Error('Initial deployment migration differs from canonical supabase/schema.sql. Run pnpm schema:sync.');
}

const requiredFragments = [
  'with (security_invoker = true)',
  'alter table public.audit_log force row level security;',
  'create policy realtime_cart_receive on realtime.messages',
  "values ('receipts', 'receipts', false, 5242880",
  'grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;',
  "('Litre', 'l', false, true)",
];

for (const fragment of requiredFragments) {
  if (!schema.includes(fragment)) {
    throw new Error(`Canonical schema is missing required fragment: ${fragment}`);
  }
}

const digest = createHash('sha256').update(schema).digest('hex');
process.stdout.write(`Schema parity verified (${digest.slice(0, 12)}).\n`);
