# Hosted Supabase Setup

Use a dedicated Supabase project per environment. The commands below must run from the project root with a matching `SUPABASE_ACCESS_TOKEN` and project reference.

## Apply The Schema

```powershell
pnpm exec supabase link --project-ref $env:SUPABASE_PROJECT_REF
pnpm exec supabase db push --linked
```

The migration creates the private `receipts` bucket, its owner-only mutation policies, all application tables/RPCs, RLS policies, Realtime authorization, canonical units, Auth trigger, and least-privilege grants. Run `pnpm verify:schema` before applying it.

## Auth

In **Authentication > Hooks**, enable **Before User Created** and select the Postgres function URI:

```text
pg-functions://postgres/public/before_user_created
```

Keep email/password signup enabled, anonymous signup disabled, email confirmation enabled, and the minimum password length at 10 or higher.

Set the Site URL to the exact production origin. Add only deliberate callback URLs, for example:

```text
https://meucesto.example.com/auth/callback
https://preview.example.com/auth/callback
http://localhost:3000/auth/callback
```

The confirmation and recovery templates must use Supabase's `{{ .ConfirmationURL }}`. Password recovery remains Supabase-managed. Meu Cesto invitation messages link to `/auth/signup?code=...` and do not use `inviteUserByEmail`.

The default Supabase SMTP can be kept during early testing. To move Auth email to Resend, enable **Custom SMTP** in Supabase Auth and enter the Resend SMTP credentials. This does not require a Next.js change or deployment.

## First Admin

The bootstrap command intentionally requires an existing confirmed Auth user. On a completely new invite-only database, create one one-time bootstrap invite as database owner in the SQL editor:

```sql
insert into public.invites(code, email, created_by, assigned_role, expires_at)
select upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8)),
       'admin@example.com', null, 'user', now() + interval '1 day'
returning code;
```

Use that returned code in the ordinary Meu Cesto signup, confirm the email, then run from a trusted machine:

```powershell
pnpm admin:bootstrap -- --email admin@example.com
```

The command refuses to run when an admin already exists. `--break-glass` explicitly overrides that protection and creates a distinct sanitized audit event. The bootstrap RPC is granted only to `service_role`; it has no public route or client UI.

## Realtime And Storage

Keep public Realtime channels disabled. The application uses private Broadcast topics only:

```text
cart-sync-{uuid}
list-sync-{uuid}
```

RLS on `realtime.messages` verifies current cart/list access for send and receive. Do not add generic authenticated Realtime policies.

Hosted Supabase owns `realtime.messages` and already enables RLS on that table. The app migration creates only the authorization policies required for private cart/list Broadcast topics; do not add `alter table realtime.messages ...` or broad grant/revoke statements in hosted projects.

The `receipts` bucket must remain private with a 5 MB limit and only JPEG, PNG, or WebP MIME types. The migration is the source of truth for the bucket and object policies. Do not make it public in the dashboard.

## Retention Job

Run this daily from a trusted scheduler with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`:

```text
pnpm retention:run
```

Defaults are 30 days after account deletion for quarantined receipts, 90 days after expiry for used/revoked invitations, 12 months for audit events, and 24 hours before unreferenced receipt objects are considered orphaned.

When `AUDIT_ARCHIVE_URL` is empty, due audit events are deleted. When set, all due events are posted in bounded JSON batches before deletion. A failed archive request aborts deletion. Set `AUDIT_ARCHIVE_BEARER_TOKEN` when the endpoint requires bearer authorization.

## Hosted Environment

Set every value documented in [`.env.example`](../.env.example). Important boundaries:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is browser-safe.
- `SUPABASE_SECRET_KEY`, provider keys, SMTP passwords, and archive credentials are server-only.
- `NEXT_PUBLIC_SITE_URL` is one exact HTTPS origin with no path or wildcard.
- AI is disabled unless a provider key and matching model are both configured.
- Open Food Facts requires a monitored contact in `OPENFOODFACTS_USER_AGENT`.

After configuration, test signup, confirmation, recovery, private receipt access, member revocation, and Realtime with non-production users before promoting the project.
