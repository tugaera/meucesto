# Meu Cesto

Meu Cesto is a Portuguese-first collaborative shopping application built with Next.js 16 and hosted Supabase. It covers invite-only accounts, shared carts and lists, price history, barcode lookup, private receipts, optional AI-assisted receipt review, offline mutation replay, and administrative catalog controls.

The current release is **1.0.1**. [`CHANGELOG.md`](./CHANGELOG.md) is the version authority.

## Runtime

| Tool | Pinned version |
| --- | --- |
| Node.js | 24.21.0 |
| pnpm | 12.4.2 |
| Next.js | 16.3.5 |
| React | 19.3.0 |
| Supabase JS / SSR | 2.116.0 / 0.12.7 |
| Serwist | 9.5.12 |
| Dexie | 4.4.6 |
| Playwright | 1.63.0 |
| Vitest | 5.0.1 |

All package versions are exact and the committed pnpm lockfile is authoritative.

## Local Setup

1. Install the pinned Node version from [`.nvmrc`](./.nvmrc) and enable Corepack.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Create `.env.local` from [`.env.example`](./.env.example) and replace every placeholder.
4. Start local Supabase with `pnpm supabase:start`, then apply a clean reset with `pnpm supabase:reset`.
5. Start the app with `pnpm dev` and open `http://localhost:3000`.

Docker is required for local Supabase. A hosted project can be used instead by configuring its URL and keys in `.env.local` and following [`docs/HOSTED_SUPABASE.md`](./docs/HOSTED_SUPABASE.md).

Never use production credentials in development or tests. Use separate Supabase projects for development, test, preview, and production.

## Commands

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm version:sync
pnpm version:verify
pnpm supabase:reset
pnpm test:db
pnpm build
pnpm test:e2e
pnpm verify:schema
pnpm verify:security
```

`pnpm verify` runs the application gates and production build. Database tests additionally require local Supabase. Playwright expects a production build and starts `next start` on port 3100.

## Hosted Deployment

The canonical database source is [`supabase/schema.sql`](./supabase/schema.sql). The initial migration is byte-normalized against it by `pnpm verify:schema`; edit the canonical schema, run `pnpm schema:sync`, and commit both files together.

For hosted Supabase:

1. Link the project and apply migrations.
2. Configure the Before User Created Auth hook, redirect allowlist, email templates, private Realtime, and private receipt bucket policies.
3. Create the first confirmed account through the documented bootstrap invite and run `pnpm admin:bootstrap -- --email admin@example.com` with service credentials.
4. Schedule `pnpm retention:run` daily in a trusted server environment.
5. Deploy Next.js with all production environment variables set server-side.

Supabase's default Auth SMTP is sufficient for initial testing. Moving Auth email to Resend later only requires enabling Custom SMTP in Supabase Auth settings with the Resend SMTP host, port, username, and password. No Next.js deployment or code change is needed. The app's optional custom invitation delivery is separately controlled by `EMAIL_PROVIDER`.

See [`docs/HOSTED_SUPABASE.md`](./docs/HOSTED_SUPABASE.md) for the exact configuration and [`docs/IMPLEMENTATION_REPORT.md`](./docs/IMPLEMENTATION_REPORT.md) for the delivered architecture and verification record.

## Operations

`pnpm retention:run` performs four bounded tasks:

- purges quarantined receipt objects after the configured account-deletion grace period;
- removes stale receipt objects that have no metadata after the orphan safety window;
- purges expired invitations, mutation receipts, rate-limit buckets, and provider request metadata;
- archives audit events before deletion when `AUDIT_ARCHIVE_URL` is set, or deletes them by default when it is empty.

Use `AUDIT_ARCHIVE_BEARER_TOKEN` only when the archive endpoint requires it. Operational scripts require the Supabase secret key and never run in the browser bundle.

## Release Process

Add one complete SemVer release entry to `CHANGELOG.md`, then run `pnpm version:sync`. Commit the changelog, `package.json`, and generated files together. `pnpm version:verify` rejects malformed versions, stale generated output, modified published entries, and mismatched release tags in CI.

## Security Notes

- Application cart/list/history writes use narrow domain RPCs with caller mutation IDs.
- Broad table and function grants are revoked; RLS is enabled on all application and Realtime tables.
- Receipt images are private and exposed through short-lived signed URLs only after current authorization.
- Server secrets are guarded by `server-only` modules and static checks.
- The service worker caches only the static shell and assets, never protected HTML, RSC, Auth, API, Supabase, signed receipt, or AI traffic.
- Analytics strips query strings before sending page paths and does not use session replay.
