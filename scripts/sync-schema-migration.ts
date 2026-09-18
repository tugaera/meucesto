import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const schemaPath = resolve(root, 'supabase', 'schema.sql');
const migrationsDirectory = resolve(root, 'supabase', 'migrations');
const migrationPath = resolve(migrationsDirectory, '20260915000000_initial_schema.sql');

const schema = readFileSync(schemaPath, 'utf8');

if (!schema.startsWith('begin;') || !schema.trimEnd().endsWith('commit;')) {
  throw new Error('Canonical schema must be one explicit transaction.');
}

mkdirSync(migrationsDirectory, { recursive: true });
writeFileSync(migrationPath, schema, 'utf8');

process.stdout.write(`Synchronized ${migrationPath}\n`);
