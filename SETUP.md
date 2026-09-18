# Meu Cesto Deployment Setup

This checklist takes the rebuilt app from this repository to hosted Supabase and Vercel.

## 1. Prerequisites

- A hosted Supabase project for production.
- A Vercel project connected to this Git branch/repository.
- Node.js `24.21.0` and pnpm `12.4.2` for local commands.
- The Supabase CLI available through the project dev dependency.
- Production values for every required variable in [`.env.example`](./.env.example).

Use separate Supabase projects for development, preview, and production. Do not reuse production credentials locally unless you are doing a deliberate production operation.

## 2. Verify The App Locally

From `C:\hubspot\developers\lista-app`:

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --version
```

If `pnpm` is not recognized on Windows, use `corepack pnpm` in place of `pnpm` for the commands below. Keeping `COREPACK_HOME` inside the project avoids Windows profile permission issues and uses the pinned pnpm version.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm version:verify
corepack pnpm verify:schema
corepack pnpm verify:security
corepack pnpm build
```

Optional local-only checks:

```powershell
corepack pnpm supabase:start
corepack pnpm supabase:reset
corepack pnpm test:db
corepack pnpm test:e2e
```

`pnpm test:db` requires Docker/local Supabase. End-to-end authenticated flows need test users in the target Supabase project.

## 3. Create And Configure Supabase

Create a new Supabase project, then collect these values:

- Project URL: `https://<project-ref>.supabase.co`
- Publishable key: browser-safe key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Secret/service role key: server-only key for `SUPABASE_SECRET_KEY`
- Project ref: used by the CLI as `SUPABASE_PROJECT_REF`
- Access token: used by the CLI as `SUPABASE_ACCESS_TOKEN`

Set these locally in your shell for the one-time database push:

```powershell
$env:SUPABASE_PROJECT_REF="your-project-ref"
$env:SUPABASE_ACCESS_TOKEN="your-supabase-access-token"
```

Then apply the migration:

```powershell
corepack pnpm verify:schema
corepack pnpm exec supabase link --project-ref $env:SUPABASE_PROJECT_REF
corepack pnpm exec supabase db push --linked
```

The migration creates the tables, RPCs, RLS policies, private receipt bucket, Realtime policies, Auth trigger function, and canonical seed data. More details are in [`docs/HOSTED_SUPABASE.md`](./docs/HOSTED_SUPABASE.md).

## 4. Supabase Dashboard Settings

In Supabase, configure Auth:

- Authentication > Providers: keep email/password enabled.
- Disable anonymous signup.
- Enable email confirmation.
- Set minimum password length to at least `10`.
- Authentication > Hooks: enable **Before User Created** with:

```text
pg-functions://postgres/public/before_user_created
```

Set the production Site URL to your final Vercel/custom domain, for example:

```text
https://meucesto.example.com
```

Add only the callback URLs you actually use:

```text
https://meucesto.example.com/auth/callback
https://your-vercel-project.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

Keep Supabase's default SMTP while testing. Later, to use Resend for Auth emails, enable **Custom SMTP** in Supabase Auth settings and enter Resend's SMTP credentials there. That does not require a Next.js code change or redeploy.

Confirm Storage and Realtime:

- The `receipts` bucket must stay private.
- Do not make receipt objects public.
- Keep public Realtime channels disabled.
- The app uses private Broadcast topics protected by database RLS.
- Hosted Supabase already owns and secures `realtime.messages`; the migration creates the app policies only.

## 5. Configure Vercel

Import the repository in Vercel and use these project settings:

- Framework preset: `Next.js`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Output directory: leave Vercel default
- Node.js: `24.x` if available, otherwise the newest supported Node version that can run Next.js 16 and this lockfile

Add production environment variables in Vercel Project Settings > Environment Variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SUPABASE_SECRET_KEY=sb_secret_replace_me
NEXT_PUBLIC_SITE_URL=https://meucesto.example.com
EMAIL_PROVIDER=disabled
EMAIL_FROM=Meu Cesto <convites@meucesto.example.com>
EMAIL_API_KEY=
EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=
EMAIL_SMTP_PASSWORD=
OPENFOODFACTS_USER_AGENT=MeuCesto/1.0 (meucesto@webmails.org)
RECEIPT_SIGNED_URL_TTL_SECONDS=300
RECEIPT_MAX_BYTES=5242880
RATE_LIMIT_HASH_SECRET=<at-least-32-random-characters>
INVITE_VALIDATION_MAX_ATTEMPTS=10
PASSWORD_RESET_MAX_ATTEMPTS=5
AI_OCR_DAILY_LIMIT=10
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
OPENAI_API_KEY=
OPENAI_MODEL=
RECEIPT_DELETION_GRACE_DAYS=30
INVITE_RETENTION_DAYS=90
AUDIT_RETENTION_MONTHS=12
AUDIT_ARCHIVE_URL=
AUDIT_ARCHIVE_BEARER_TOKEN=
RECEIPT_ORPHAN_GRACE_HOURS=24
```

Notes:

- `NEXT_PUBLIC_SITE_URL` must be one exact HTTPS origin with no path and no wildcard.
- `SUPABASE_SECRET_KEY`, AI keys, SMTP passwords, and archive tokens are server-only.
- AI receipt extraction is disabled unless a provider key and matching model are both set.
- `EMAIL_PROVIDER=disabled` still lets admins generate/copy invite links. Set SMTP values only when you want the app to send custom invite emails.
- If `AUDIT_ARCHIVE_URL` is empty, old audit events are deleted after the retention window.

Deploy from Vercel after the environment variables are set.

## 6. Configure The Domain

In Vercel:

1. Add your production domain.
2. Follow Vercel's DNS instructions.
3. Wait until Vercel marks the domain as valid.

Then update both places to the same final origin:

- Vercel `NEXT_PUBLIC_SITE_URL`
- Supabase Auth Site URL and callback allowlist

Redeploy Vercel after changing `NEXT_PUBLIC_SITE_URL`.

## 7. Create The First Admin

On a brand-new invite-only database, create one bootstrap invite in Supabase SQL editor:

```sql
insert into public.invites(code, email, created_by, assigned_role, expires_at)
select upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8)),
       'admin@example.com', null, 'user', now() + interval '1 day'
returning code;
```

Use that code in the normal signup page, confirm the email, then run from a trusted machine with production Supabase environment variables available:

```powershell
corepack pnpm admin:bootstrap -- --email admin@example.com
```

The command refuses to run if an admin already exists.

## 8. Schedule Retention

The retention job is currently a trusted CLI command, not a public HTTP route:

```powershell
corepack pnpm retention:run
```

Run it daily from a secure scheduler that can provide:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY
RECEIPT_DELETION_GRACE_DAYS
INVITE_RETENTION_DAYS
AUDIT_RETENTION_MONTHS
AUDIT_ARCHIVE_URL
AUDIT_ARCHIVE_BEARER_TOKEN
RECEIPT_ORPHAN_GRACE_HOURS
```

Good options are GitHub Actions with encrypted secrets, a small private server cron, or a Supabase Edge Function/cron wrapper. Vercel Cron cannot run this CLI directly unless you first add a protected API route that invokes the same retention logic.

## 9. Import Reference Data

After the schema is applied and the server environment values are available locally, import the starter supermarket stores, brands, and categories:

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm reference:import
```

The script loads `.env` and then `.env.local` when present. It requires:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY
```

It is safe to run more than once. Store and brand rows are upserted by name, and category rows are created only when the same name does not already exist under the same parent.

## 10. Smoke Test Production

After deployment:

- Open `/` and `/auth/login`.
- Sign up with an invite code.
- Confirm the email through Supabase Auth.
- Create a cart/list and invite another user.
- Add, edit, complete, and remove shopping items.
- Upload a receipt and confirm the signed receipt URL works only for authorized users.
- Test password recovery.
- Revoke a member and verify access changes.
- Confirm offline queue behavior by adding an item offline, reconnecting, and checking sync.
- Confirm the admin dashboard works for the bootstrapped admin only.

## 11. Release Checklist

Before treating the deployment as production-ready:

- `pnpm verify` passes locally or in CI.
- Supabase migration is applied to the correct project.
- Supabase Auth hook is enabled.
- Supabase callback URLs match the deployed domain.
- Vercel production env vars are complete.
- `RATE_LIMIT_HASH_SECRET` is unique and strong.
- AI keys and models are configured together, or both left empty.
- Starter reference data has been imported.
- Retention scheduler is active.
- First admin has been bootstrapped.
- A real production smoke test has passed.
