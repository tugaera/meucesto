# Meu Cesto Implementation Report

## Release

The delivered application release is **1.0.1**, dated **2026-09-18**. `CHANGELOG.md` is the version authority; `package.json`, `src/generated/app-version.ts`, and `src/generated/changelog.ts` are synchronized from it.

The exact delivered changelog entry is:

```markdown
## [1.0.1] - 2026-09-18

### Added
- Added persisted edit and removal controls for offline-created cart items, including translated pending, deletion, conflict, and retry states.
- Added queue tests covering dependency ordering, temporary-to-server ID mapping, and authoritative revision propagation across insert, update, and delete replay.

### Fixed
- Fixed offline cart update and delete replay so dependent changes wait for local inserts, retain strict ordering, reuse mapped server revisions, reject changes behind failed or deleted dependencies, keep the optimistic row attached to the active failure, and make reviewed expired mutations retryable.
- Stabilized the six-page production accessibility scan with a dedicated timeout for parallel desktop and mobile browser runs.
```

## Exact Toolchain

| Component | Version |
| --- | --- |
| Node.js | 24.21.0 |
| pnpm | 12.4.2 |
| Next.js | 16.3.5 |
| React / React DOM | 19.3.0 |
| TypeScript | 6.0.3 |
| Supabase JS / SSR / CLI | 2.116.0 / 0.12.7 / 2.117.0 |
| Serwist | 9.5.12 |
| Dexie | 4.4.6 |
| Playwright | 1.63.0 |
| Vitest | 5.0.1 |
| Tailwind CSS | 4.3.3 |

Every package declaration is exact and `pnpm-lock.yaml` is committed. `.nvmrc`, `package.json#engines`, and `packageManager` pin the runtime.

## Setup And Services

1. Use Node 24.21.0 and pnpm 12.4.2.
2. Run `pnpm install --frozen-lockfile`.
3. Create `.env.local` from `.env.example` and replace every placeholder.
4. Use a separate development/test Supabase project. `.env.test.example` documents the isolated test contract.
5. Apply `supabase/migrations/20260915000000_initial_schema.sql` to hosted Supabase.
6. Enable the `public.before_user_created` Auth hook, configure the exact redirect allowlist, keep Realtime channels private, and keep the `receipts` bucket private.
7. Complete the one-time first-admin process in `docs/HOSTED_SUPABASE.md`.
8. Run `pnpm retention:run` daily from a trusted environment.

Supabase Auth email uses its default SMTP initially. Moving Auth email to Resend is a Supabase Custom SMTP setting and needs no Next.js deployment. App-generated invitation delivery remains provider-neutral and is disabled until `EMAIL_PROVIDER` plus matching credentials are configured.

Open Food Facts uses `OPENFOODFACTS_USER_AGENT`; the supplied safe example is `MeuCesto/1.0 (meucesto@webmails.org)`.

## Schema Status

`supabase/schema.sql` is canonical and the initial migration is normalized byte-for-byte against it. The latest parity check passed with SHA-256 prefix `ee6e2898110d`.

The schema includes all application tables, constraints, indexes, triggers, seeds, a security-invoker latest-price view, 97 hardened functions, RLS/forced RLS, least-privilege grants, a private receipt bucket, private Realtime topic policies, the Auth hook, retention jobs, and bootstrap support.

`src/types/database.ts` is the committed schema contract snapshot. Regenerate it with `pnpm types:database` whenever the schema is applied to local Supabase.

## Verification Record

Executed on Windows with Node 24.21.0:

| Command / gate | Outcome |
| --- | --- |
| `pnpm lint` | Passed, zero warnings |
| `pnpm typecheck` | Passed |
| `pnpm test:unit` | Passed: 15 files, 37 tests |
| `pnpm version:verify` | Passed for 1.0.1 |
| `pnpm verify:schema` | Passed, canonical schema and migration match |
| `pnpm verify:security` | Passed: 138 source files, 97 hardened functions |
| `pnpm build` | Passed: Next.js production build, TypeScript, 21 static pages, and Serwist bundle |
| `pnpm test:e2e` | Passed: 8 project executions across desktop Chrome and Pixel 7 |
| Visual inspection | Passed for login and privacy at desktop/mobile sizes after responsive correction |

The browser suite verifies public localization/version display, all public pages for serious/critical accessibility violations, security headers, the web manifest, and production service-worker cache exclusions.

Two pgTAP files containing 38 schema/security assertions are committed. They were **not executed on this machine** because Docker/PostgreSQL is unavailable. Run `pnpm supabase:start`, `pnpm supabase:reset`, and `pnpm test:db` in CI or a machine with Docker.

Authenticated multi-user browser workflows were not run here because no isolated hosted Supabase test credentials were supplied. Public production-browser checks use non-secret placeholders and do not perform backend mutations. This is an environment-dependent verification gap, not a known failing test.

## Security Configuration

- Storage: `receipts` is private, MIME/size constrained, owner-mutated, and served through short-lived URLs after current authorization.
- Realtime: only private `cart-sync-{uuid}` and `list-sync-{uuid}` Broadcast topics are authorized through RLS.
- Auth: custom code signup is enforced by the Before User Created hook plus the transactional Auth trigger; native `inviteUserByEmail` is not used.
- Grants: client table mutation grants are revoked; application writes use narrow domain RPCs with caller-generated mutation IDs.
- Redirects: the site origin and relative callback destinations are strictly validated; hosted allowlists must contain only deliberate origins.
- Service worker: authenticated documents, RSC, Auth/API/Supabase requests, signed receipt URLs, and AI traffic are NetworkOnly and never runtime-cached.
- Secrets: Supabase secret, rate-limit secret, SMTP/provider keys, and AI keys remain in `server-only` modules.
- Analytics: query strings are removed before Vercel Analytics/Speed Insights events are sent; session replay is not used.
- Retention: deleted-account receipt objects are quarantined for 30 days; invites for 90 days after expiry; audit events for 12 months, archived first when configured and deleted by default otherwise.

Hosted dashboard configuration cannot be proven from repository code. Confirm the Auth hook, redirect allowlist, private Realtime setting, and bucket privacy after applying the migration.

## Optional Features

- AI receipt extraction is unavailable until an Anthropic or OpenAI key/model pair is configured. Anthropic is attempted first; OpenAI is used only for classified retriable failures.
- Custom invitation email is unavailable while `EMAIL_PROVIDER=disabled`; invite generation and copy remain available.
- Audit archiving is disabled when `AUDIT_ARCHIVE_URL` is empty; due records are deleted by default as requested.

## Visual Assets

The brand mark was generated as a new raster asset, then exported into the app icons. Generation direction: a crisp woven grocery basket containing a paper receipt and green leaf, emerald/charcoal/white with a restrained coral accent, transparent background, no text, no gradient, no shadow, and no generic trolley silhouette.

## Final Audit

The source scan found no `TODO`, `FIXME`, `HACK`, explicit `any`, TypeScript suppression, or client-side secret import in application code. There are no known build, unit, public-browser, accessibility, schema-parity, version-parity, or static-security failures. The two explicitly unexecuted areas are direct database tests and authenticated multi-user browser tests, both requiring an isolated Supabase runtime.
