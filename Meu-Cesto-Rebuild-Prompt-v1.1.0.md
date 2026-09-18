PROMPT START

# Rebuild: Meu Cesto (shopping assistant)

Build a brand-new Next.js app that replicates the product below **exactly in features and UX**, but as a clean, production-ready implementation. Do **not** copy the old repository's dual-path fallbacks, stale schema, insecure sharing assumptions, or "column might not exist" retries.

App name: **Meu Cesto**  
Tagline: Shopping Assistant  
Audience: Portuguese-first families shopping together (EUR €).  
Default locale: `pt`. Also support `en`.
Initial application release version: `1.0.0`; every later change follows the version/changelog contract in section 2.3.

---

## 0. Hard rules (do not reintroduce these bugs)

1. **One complete schema from day one.** No app-layer "if column missing, retry without it" behavior. That previously dropped brand, unit, tags, and `original_price` values silently.
2. **RLS empty SELECT is not proof of empty data.** Denied shared access can return `[]`, not an error. Shared carts and lists must use the same authorized RPC path for owners and members.
3. **No RPC-then-silent-direct-query fallback.** Surface typed RPC failures; never hide a failed authorization or migration behind a direct table query.
4. **Every UPDATE policy must have both `USING` and `WITH CHECK`.** Also restrict column privileges or route updates through RPCs so users cannot change protected columns.
5. **Application permissions must match database permissions.** Do not expose UI or server actions that RLS/grants will reject.
6. **Do not read or write undeclared columns.** In particular, never assume `_synced_at`, `updated_at`, `revision`, or any other synchronization field exists unless it is defined in `schema.sql` and generated types.
7. **`supabase/schema.sql` is the canonical full schema.** It must contain all extensions, types, tables, constraints, indexes, triggers, views, functions, policies, grants, seeds, Storage policies, and Realtime policies. Deployment migrations must remain provably synchronized with it.
8. **The receipts bucket is private.** Store object paths, not signed URLs. Generate short-lived signed URLs only after current authorization is checked.
9. **`handle_new_user` must derive email as** `COALESCE(NEW.email, NEW.raw_user_meta_data->>'email')`.
10. **Unit abbreviations are canonical.** Seed and normalize to `un`, `g`, `kg`, `ml`, `l`, `dose`. Open Food Facts parsing must map litres to lowercase `l`, never `L`.
11. **`<html lang>` follows the active locale.** Default to `pt`; never hardcode `en`.
12. **No god files or unsafe type escapes.** Split the shopping UI, use named constants, no explicit `any`, no `@ts-ignore`, no commented-out production code, and no pervasive `as unknown as` casts.
13. **Do not nest another copy of the project inside itself.**
14. **History pagination covers owned and shared carts together.** Union authorized rows first, then order and paginate. Never paginate owned carts and append all shared carts to every page.
15. **Realtime Broadcast is private and authorization-aware.** Connect with `private: true`; enforce policies on `realtime.messages` for exact cart/list topics. A JWT alone is not authorization to a resource.
16. **Fail fast on invalid configuration.** Validate all required environment variables and trusted origins at server startup. Never run with missing or malformed backend configuration.
17. **Invite-only signup is atomic.** Invalid, expired, revoked, mismatched, or already-used invites must reject Auth user creation. Do not create an orphan Auth user and attempt to repair it afterward.
18. **Do not use Supabase `inviteUserByEmail` for this custom code flow.** Send an ordinary transactional email containing the app's `/auth/signup?code=...` URL.
19. **Users cannot mutate their role, email, inviter, or identity columns.** Preferences are updated through a narrow RPC; role changes use an admin-only RPC with final-admin protection.
20. **Every `SECURITY DEFINER` function is hardened.** Use `SET search_path = ''`, fully qualify every object, revoke execution from `PUBLIC`, grant only the minimum roles, and authorize before reading or writing protected data.
21. **Views must not bypass RLS.** `latest_product_prices` must be a security-invoker view with deterministic tie-breaking and explicit `SELECT` grants only.
22. **Checkout is one transaction.** Product resolution/creation, price-history insertion, cart-item updates, total calculation, and finalization either all commit or all roll back.
23. **Mutations are concurrency-safe and idempotent.** Use row locks, uniqueness constraints, revisions where appropriate, and caller-generated mutation/idempotency keys. Retries must not duplicate items, shares, invites, or price entries.
24. **Resource UUIDs are not bearer invitations.** Share links use separate high-entropy, hashed, expiring, revocable join tokens. Joining occurs only through an explicit POST/server action after confirmation.
25. **Realtime is an invalidation signal, not the source of truth.** Broadcast minimal identifiers/revisions, validate payloads, deduplicate events, and refetch authorized RPC state after relevant events or reconnects.
26. **Offline data is user-scoped and replay-safe.** Never store Auth tokens or server secrets in IndexedDB. Clear user-scoped local state on logout/account switch, honor dependencies, and isolate permanent failures without blocking unrelated work.
27. **Service workers never cache personalized or sensitive responses.** Do not cache Supabase traffic, protected HTML, RSC payloads, Server Action responses, Auth callbacks, signed receipt URLs, or AI-provider responses.
28. **Email/profile lookup is never exposed as a generic directory.** Resolve share recipients inside resource-specific RPCs and return generic machine-readable errors to prevent user enumeration.
29. **Persisted money uses decimal-safe, identical client/server rules.** Never use ordinary binary floating-point arithmetic for saved totals or discount calculations.
30. **No client-held privileged key.** The Supabase secret key and all third-party provider credentials are imported only by modules marked `server-only`.
31. **Every accepted change is versioned and recorded.** The newest released Semantic Version entry in root `CHANGELOG.md` is the authoritative application version. Every merged change set must create a new version and complete changelog entry; `package.json`, the generated version module, the login footer, and the production release tag must match it. Never hardcode a separate UI version or rewrite published history.

### 0.1 Resolved design decisions and invariants

These choices are authoritative and resolve ambiguities in the feature description:

- **Invite model:** keep the custom invite-code signup screen. The public validation check is only for user experience; the security boundary is the Auth hook/trigger transaction that validates and consumes the invite during user creation.
- **Invite email:** use a provider-neutral transactional-email adapter. Never mix this flow with Supabase's native invitation-user flow.
- **Profile creation:** normal signup creates the profile and consumes the invite atomically. A narrowly scoped `ensure_my_profile()` RPC exists only as an idempotent recovery path and always creates a `user` profile for `auth.uid()` using the authenticated email.
- **Sharing by link:** copy a token URL such as `/shopping/join/{token}` or `/lists/join/{token}`. The cart/list UUID may still appear in authenticated navigation URLs, but possession of a UUID never grants access or membership.
- **Data boundary:** cart/list reads and all cart/list mutations use authorized domain RPCs for both owners and members. Do not branch into owner-direct versus member-RPC implementations.
- **Finalized history access:** a member can view a finalized cart and its receipts only while the cart share still exists. Leaving or owner revocation removes active and historical access immediately.
- **Receipt permissions:** only the cart owner may upload, reorder, or delete receipts. Current authorized members may view them through server-generated signed URLs.
- **Price history:** checkout-created entries are insert-only for ordinary users. Admin/moderator corrections are allowed only through audited RPCs.
- **Authoritative state:** PostgreSQL transactions and RPC results are authoritative. Client previews, Dexie, cache revalidation, and Realtime events must reconcile to server state.

---

## 1. Product (what it is)

Mobile-first collaborative shopping assistant:

- Active shopping cart for in-store use
- Planning lists
- Shared carts/lists with private realtime synchronization
- Product catalog plus per-store price history
- Barcode scan using the local database first, then Open Food Facts
- Discounts showing original versus paid price
- Invite-only accounts with roles
- Installable PWA with an idempotent offline mutation queue
- Private receipt photos and optional AI-assisted receipt extraction
- User data export and account deletion controls

---

## 2. Tech stack (keep this)

| Layer | Choice |
| --- | --- |
| App | Next.js **16.3.x**; at implementation time resolve and lock the latest patched `16.3` release, React 19, TypeScript, Server Components, Server Actions |
| Runtime | One supported Active LTS Node.js version, pinned to an exact version in `.nvmrc` and `package.json#engines` |
| Package manager | `pnpm`, pinned to an exact version in `packageManager`; commit `pnpm-lock.yaml`; do not mix package managers |
| CSS | Tailwind CSS 4 |
| DB / Auth / Realtime / Storage | Supabase PostgreSQL, Auth email/password, private authorized Broadcast channels, private Storage |
| PWA | Serwist (`src/app/sw.ts` to `public/sw.js`) with an explicit static-only cache policy |
| Offline | Dexie IndexedDB, queued mutations, dependency tracking, idempotent reconnect synchronization |
| AI (optional) | Anthropic first, OpenAI fallback for defined retriable failures only; app works without either key |
| Email | Provider-neutral server-only transactional email adapter |
| i18n | Custom JSON plus React context; no `next-intl` |
| Analytics | Vercel Analytics plus Speed Insights, configured not to capture sensitive payloads |
| Currency | Euro (€) |
| Testing | Vitest, Playwright, SQL/pgTAP or equivalent Supabase database tests, type/lint/static security checks |

### 2.1 Runtime and dependency reproducibility

- Pin every production and development dependency to an exact resolved version; no floating `latest`, caret, or unreviewed range in the delivered lockfile.
- Record the exact Node, pnpm, Next.js, React, Supabase client, Serwist, Dexie, Playwright, and Vitest versions in the final implementation report.
- Commit `.nvmrc`, `pnpm-lock.yaml`, and the `packageManager`/`engines` fields.
- Use separate development, test, preview, and production environment configuration. Never reuse production secrets in tests.
- The production build and service worker must be tested from the compiled output, not only through the development server.

### 2.2 Environment contract

Canonical environment variables:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY= # server only; import only from a server-only module
NEXT_PUBLIC_SITE_URL= # exact trusted origin, no path, no wildcard

EMAIL_FROM=
EMAIL_PROVIDER=
EMAIL_API_KEY= # server only

OPENFOODFACTS_USER_AGENT= # app name/version plus a monitored contact
RECEIPT_SIGNED_URL_TTL_SECONDS=300
RECEIPT_MAX_BYTES=5242880
RATE_LIMIT_HASH_SECRET= # server only; HMAC/hash raw IP/email/code keys before persistence
INVITE_VALIDATION_MAX_ATTEMPTS=10
PASSWORD_RESET_MAX_ATTEMPTS=5
AI_OCR_DAILY_LIMIT=10

ANTHROPIC_API_KEY= # optional, server only
OPENAI_API_KEY= # optional, server only
```

Rules:

- Validate required values at server startup with a typed schema and descriptive errors.
- Validate `NEXT_PUBLIC_SITE_URL` as one exact HTTPS origin in production. Redirect targets must be relative or on an explicit allowlist.
- `src/lib/supabase/admin.ts`, email, AI, and rate-limit modules must contain `import 'server-only'`.
- Prefer the publishable/secret key names above. Support legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` only behind a documented compatibility adapter when the target Supabase project still requires them; never expose either privileged form to client code.
- Provide `.env.example` with comments and safe placeholders only.

### 2.3 Application version and changelog contract

The root `CHANGELOG.md` is the human-readable and machine-readable source of truth for the application version. The initial implemented release is `1.0.0`.

Required files and commands:

- `CHANGELOG.md` — complete release history, newest release first.
- `package.json#version` — synchronized mirror of the latest released changelog version.
- `scripts/sync-app-version.ts` — parses the latest released changelog heading and writes synchronized version outputs.
- `scripts/verify-app-version.ts` — validates the changelog, version ordering, repository diff, generated output, and package version.
- `src/generated/app-version.ts` — generated current-version constants consumed by the application; never hand-edit this file.
- `src/generated/changelog.ts` — generated structured release data used by the public page; never hand-edit this file.
- `pnpm version:sync` and `pnpm version:verify` — documented release-preparation and CI scripts.

Authoritative format:

```markdown
# Changelog

## [1.2.0] - 2026-09-15

### Added
- Added a user-visible capability.

### Changed
- Changed an existing behavior.

### Fixed
- Fixed a defect.
```

Rules:

1. The newest **released** heading matching `## [MAJOR.MINOR.PATCH] - YYYY-MM-DD` is the current application version. An optional `[Unreleased]` section may exist on a development branch, but protected-branch CI rejects pending entries that were not promoted to a numbered release.
2. One accepted request, pull request, or deliberately grouped change set creates exactly one new version. All changes in that set must be listed; no merged code, schema, configuration, dependency, documentation, translation, or test change may omit the version bump and changelog entry.
3. Use Semantic Versioning:
   - **MAJOR** for intentionally incompatible behavior, public API/RPC contracts, irreversible data-model expectations, or a migration requiring coordinated consumers.
   - **MINOR** for backward-compatible features or materially expanded behavior.
   - **PATCH** for bug fixes, security hardening without an intentional compatibility break, dependency/configuration updates, refactors, tests, translations, and documentation-only changes.
4. Use the categories `Added`, `Changed`, `Fixed`, `Security`, `Deprecated`, and `Removed` as applicable. Omit empty categories. Entries must be specific enough to identify every change in the release.
5. Published release entries are immutable. Correct an old omission or wording error in a new patch release rather than silently editing historical entries.
6. During release preparation, `pnpm version:sync` reads `CHANGELOG.md`, validates SemVer/date/category syntax, updates `package.json#version`, and deterministically generates both the current-version constants and structured changelog data:

```ts
// src/generated/app-version.ts
// Generated by scripts/sync-app-version.ts. Do not edit.
export const APP_VERSION = '1.2.0' as const;
export const APP_RELEASE_DATE = '2026-09-15' as const;
```

`src/generated/changelog.ts` contains typed release/category/entry records in the same order as the Markdown file, allowing `/changelog` to render without runtime filesystem access. Commit both generated files.

7. The version must not come from an independently maintained environment variable, component literal, database row, or service-worker constant. All consumers import the generated module or a single typed wrapper around it.
8. `pnpm version:verify` is read-only: it rebuilds the expected package/generated values in memory or a temporary directory and fails when:
   - the latest version is malformed, duplicated, or not greater than the previous release;
   - its date is not valid ISO `YYYY-MM-DD`;
   - `package.json`, either generated module, service-worker cache source, login footer source, or release metadata differ from the changelog;
   - a repository change relative to the target branch lacks both a new version and a complete changelog entry;
   - a historical released entry was modified instead of adding a new release.
9. Production releases are tagged `vMAJOR.MINOR.PATCH`. The release job additionally verifies that the tag, deployed build, login display, public changelog, and implementation report all use the same exact stable version.
10. Changelog text must never contain secrets, personal data, live invite/join tokens, exploit instructions, or sensitive incident details. Security entries describe impact and remediation at a safe, user-understandable level.

---

## 3. Routes

Public:

- `/` redirects to `/shopping` with a valid session, otherwise `/auth/login`.
- `/auth/login`
- `/auth/signup` — invite code required; supports `?code=`.
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/callback` — email confirmation/password recovery callback with strict redirect validation.
- `/privacy` — privacy notice, providers, retention, export/deletion rights.
- `/changelog` — public, read-only release history generated from root `CHANGELOG.md`; newest version first.

Protected layout includes desktop sidebar, mobile bottom navigation, offline/sync status, and pull-to-refresh:

- `/shopping` — active cart. Query parameters: `?cart=` for an already-authorized shared cart and `?list=` to attach an accessible tracking list.
- `/shopping/join/[token]` — preview and confirm a cart join token; GET has no side effects.
- `/lists` — owned and shared lists.
- `/lists/[id]` — list detail.
- `/lists/join/[token]` — preview and confirm a list join token; GET has no side effects.
- `/products` — catalog, search, details, and price history.
- `/history` — correctly paginated authorized finalized carts, owned and shared.
- `/history/[id]` — authorized cart detail and receipts.
- `/profile` — locale, timezone, password, account info, data export, account deletion.
- `/admin` — admin/moderator only; all others redirect to `/shopping`.

Navigation: Shopping, Lists, Products, History, Profile. Show Admin only for admin/moderator.

Theme: emerald (`#059669`), gray-50 background, mobile-first, `max-w-lg` cart, `max-w-3xl` admin.  
PWA: name `Meu Cesto`, `start_url: /shopping`, standalone, portrait, 192/512 icons.

### 3.1 Accessibility and locale baseline

Applies to every route:

- Every interaction is keyboard reachable and has a visible focus indicator.
- Modals trap focus, close on Escape, label their title/description, and restore focus to the invoking control.
- Every input has an associated label and accessible error/help relationship.
- Meaning is never communicated by color alone.
- Meaningful avatars/icons have an `aria-label` or visible text equivalent; decorative icons are hidden from assistive technology.
- Touch targets are at least 44 by 44 CSS pixels unless an equivalent adjacent target exists.
- Respect `prefers-reduced-motion`, including hold animations, scanner transitions, and pull-to-refresh.
- Use polite live regions for scanner status, offline/sync state, tracking progress, and mutation success/failure.
- The long-press Product Details interaction must also have a visible, keyboard-accessible button/menu action.
- Map app locale `pt` to `pt-PT` formatting and `en` to `en-GB` formatting. Use `Intl.NumberFormat` and `Intl.DateTimeFormat`.
- Store `profiles.timezone` as an IANA timezone. Initialize it from the browser after signup, allow it to be changed, and fall back to `Europe/Lisbon`.
- Portuguese decimal-comma entry and English decimal-point entry must both parse safely without ambiguity.

---

## 4. Auth, roles, invites

Roles: `admin` | `moderator` | `user`. Default: `user`.

### 4.1 Atomic invite-only signup

The authoritative signup flow is:

1. Normalize the invite code (`trim`, uppercase) and submitted email (`trim`; compare case-insensitively).
2. The UI may call a rate-limited server endpoint for a generic validation result. This is user-experience feedback only and must not reveal whether a specific email/account exists.
3. Call `signUp` with `emailRedirectTo = {trustedOrigin}/auth/callback` and include the normalized invite code in signed/controlled signup metadata used by the Auth hook.
4. A configured **Before User Created** hook validates the invite: exact code, not used, not revoked, not expired, permitted assigned role, and optional invite email matching the submitted Auth email.
5. `handle_new_user` runs in the Auth-user insert transaction. It locks the invite row, revalidates it to defeat races, inserts the profile with the invite's role/inviter, and marks the invite used.
6. Any failure raises an exception and aborts Auth user creation. There must be no successfully created Auth user without the corresponding consumed invite and profile.
7. Confirmation/login proceeds through `/auth/callback` after the transaction succeeds.

Additional rules:

- `validate_invite_code` is not directly exposed to arbitrary browser Supabase calls. The public endpoint invokes it server-side behind a persistent, non-process-memory rate limiter.
- Rate-limit by hashed IP plus hashed code, and add a broader per-IP window. Store only HMAC/hashed keys, never raw IP addresses, emails, or codes.
- Return generic public messages such as `INVITE_INVALID_OR_UNAVAILABLE`; log only sanitized internal error codes.
- The invitation email is an ordinary transactional message containing `{origin}/auth/signup?code={code}`. **Do not call `inviteUserByEmail`.**
- Sending an email does not consume the invite. An email-provider failure returns a clear retryable error and leaves the invite available.
- Reject invite creation for an email already registered or already holding an active equivalent invite, without leaking this check outside the authorized admin UI.

### 4.2 Password recovery

- `/auth/forgot-password` calls `resetPasswordForEmail` with `redirectTo = {trustedOrigin}/auth/callback?type=recovery`.
- Always return a generic success response to the public UI, whether or not the email exists.
- Apply a persistent rate limit by hashed IP and hashed normalized email.
- `/auth/callback` validates the recovery type/state and redirects only to the allowlisted `/auth/reset-password` route.
- `/auth/reset-password` requires a valid recovery session, minimum six characters, confirmation match, and uses `updateUser`.
- Expired, replayed, or malformed recovery links show a translated non-sensitive error and a link to request another reset.
- Logged-in password change on `/profile` first verifies the current password with `signInWithPassword`, then requires a minimum of six characters and matching confirmation before `updateUser`. Never log either password or preserve it in component/global state longer than necessary.

### 4.3 Invite creation and management

- Codes are eight uppercase alphanumeric characters generated cryptographically; never use a predictable sequence.
- Fields include optional target email, assigned role, expiration, creator, created time, used user/time, and revocation time.
- Admin can assign any role.
- Moderator can invite only `user`.
- Creator can revoke/delete only an unused invite they are authorized to manage; admin can manage all invites.
- Admin UI actions: generate code, copy code/link, send email, revoke unused invite.
- The Users page shows inviter email only to admin/moderator through an authorized result; no generic profile-directory RPC.

### 4.4 Permissions

| Capability | user | moderator | admin |
| --- | :---: | :---: | :---: |
| Use carts/lists/sharing/history and view products | ✓ | ✓ | ✓ |
| Create products through controlled add/checkout flows | ✓ | ✓ | ✓ |
| Create an unverified brand through type-ahead | ✓ | — | — |
| Manage stores/categories/brands/units/products/price entries | — | ✓ | ✓ |
| Confirm unverified brands | — | ✓ | ✓ |
| Hard-delete eligible categories/brands/units/products | — | — | ✓ |
| Invite users | — | user role only | any role |
| Change user roles | — | — | ✓ |
| View sanitized audit events | — | — | ✓ |

Defense in depth:

- Server actions call `requireAdminOrModerator()` or `requireAdmin()` as applicable, then the database independently authorizes the RPC.
- A user can update only their language and timezone through `update_my_preferences()`.
- `profiles.role`, `profiles.email`, `profiles.invited_by`, and `profiles.id` are never directly client-updatable.
- `admin_update_user_role()` prevents an admin from demoting/deleting the final remaining admin.
- If a profile is unexpectedly missing, `ensure_my_profile()` can create only `id = auth.uid()`, the authenticated email, role `user`, no chosen inviter, default locale `pt`, and default timezone. It is idempotent and cannot upgrade privileges.

### 4.5 First-admin bootstrap

Provide a documented, idempotent one-time CLI/SQL bootstrap command that:

- Requires a pre-existing confirmed Auth user email or UUID.
- Runs with database-owner/secret credentials outside the public application.
- Creates or updates that user's profile to `admin` only when no admin exists, unless an explicit break-glass flag is supplied.
- Cannot be invoked through a public route, client bundle, or ordinary authenticated RPC.
- Records a sanitized audit event.

Middleware refreshes Supabase session cookies on every request without redirect loops.

### 4.6 Login version footer

- `/auth/login` displays `Meu Cesto v{APP_VERSION}` in a persistent, unobtrusive footer below the login card. It remains visible in initial, loading, validation-error, and authentication-error states.
- Import `APP_VERSION` from the generated version module through the shared version wrapper; do not duplicate or hardcode the value in the component or translations.
- The version text links to `/changelog`. Use a translated accessible label such as `View changes for version {version}` / `Ver alterações da versão {version}`, a visible keyboard focus style, and sufficient contrast despite the muted visual treatment.
- The literal version identifier is not translated. Surrounding labels and changelog navigation are translated.
- The footer must render on the server/build without a client-side fetch, flash of an old value, or dependency on authentication/database availability.

---

## 5. Final database contract (implement all of this in `supabase/schema.sql`)

### 5.0 Global DDL conventions

Extensions:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
```

Define at minimum:

- `app_role` enum: `admin`, `moderator`, `user`.
- `locale_code` enum: `pt`, `en`.
- A reusable `set_updated_at()` trigger function.
- A reusable authorization helper for role checks that cannot be spoofed through JWT user metadata.
- Reusable `can_access_cart(uuid)`, `is_cart_owner(uuid)`, `can_access_list(uuid)`, and `is_list_owner(uuid)` helpers used consistently by RPCs and Realtime policies.
- A validator for `tracking_check_state` that accepts only the documented object shape and arrays of UUID strings.
- A category-cycle/subcategory-parent validation trigger.

Schema rules:

- Every application table has an explicit primary key. Use UUIDs with `uuid_generate_v4()` unless a natural/composite key is explicitly stated.
- Every timestamp is `timestamptz` with UTC semantics. All `created_at` columns are `NOT NULL DEFAULT now()`; mutable tables also define `updated_at NOT NULL DEFAULT now()` and the update trigger.
- Every foreign key declares its exact `ON DELETE` behavior. Do not rely on defaults.
- All human names are trimmed, nonblank, and bounded to a reasonable length. Case-insensitive uniqueness uses `citext` or a normalized expression index.
- Barcodes are stored as text, normalized in one shared function, and never converted to numbers; leading zeroes must survive.
- Money is `numeric(12,2)` and purchase/package quantities are `numeric(12,3)` unless a field explicitly requires another scale.
- All persisted arrays and JSON fields are `NOT NULL` with safe defaults and database checks.
- Index every foreign key and every column used by RLS, authorization helpers, search, ordering, deduplication, or cursor pagination.
- Direct table grants are minimized. Sensitive writes occur through domain RPCs rather than broad `INSERT`/`UPDATE`/`DELETE` grants.
- RLS is enabled and forced where supported on every application table, including internal operational tables even when no client role is granted access.
- Names, error codes, and function signatures in `schema.sql`, generated TypeScript types, and application wrappers must match exactly.

### 5.1 Tables

#### `profiles`

- `id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `email citext NOT NULL UNIQUE`
- `role app_role NOT NULL DEFAULT 'user'`
- `language locale_code NOT NULL DEFAULT 'pt'`
- `timezone text NOT NULL DEFAULT 'Europe/Lisbon'`
- `invited_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `created_at`, `updated_at`
- Validate a bounded IANA-like timezone string in the app and reject empty values in the database.

#### `invites`

- `id uuid PRIMARY KEY`
- `code text NOT NULL UNIQUE` with `^[A-Z0-9]{8}$` check
- `email citext NULL`
- `created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `assigned_role app_role NOT NULL DEFAULT 'user'`
- `used_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `used_at timestamptz NULL`
- `expires_at timestamptz NOT NULL`
- `revoked_at timestamptz NULL`
- `created_at`, `updated_at`
- `expires_at > created_at`
- `used_by IS NULL OR used_at IS NOT NULL`; validation treats any non-null `used_at` as consumed even if the user was later deleted.
- Index active/unexpired lookup by code and normalized email.

#### `stores`

- `id uuid PRIMARY KEY`
- `name citext NOT NULL UNIQUE`
- `is_active boolean NOT NULL DEFAULT true`
- `sort_order integer NULL`
- `created_at`, `updated_at`
- No hard delete in normal operation. Historical FKs use `ON DELETE RESTRICT`.

#### `categories`

- `id uuid PRIMARY KEY`
- `name citext NOT NULL`
- `parent_id uuid NULL REFERENCES categories(id) ON DELETE RESTRICT`
- `is_active boolean NOT NULL DEFAULT true`
- `sort_order integer NULL`
- `created_at`, `updated_at`
- Unique normalized `(name, coalesce(parent_id, nil-uuid))`.
- `parent_id <> id` and a trigger rejects all indirect cycles.
- Category deletion is allowed only to admins and only when no products or children reference it.

#### `brands`

- `id uuid PRIMARY KEY`
- `name citext NOT NULL UNIQUE`
- `is_active boolean NOT NULL DEFAULT true`
- `is_verified boolean NOT NULL DEFAULT true`
- `created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `created_at`, `updated_at`
- Regular-user creation always forces `is_verified = false`; admin/moderator catalog creation forces `true` unless explicitly reviewing a pending brand.

#### `units`

- `id uuid PRIMARY KEY`
- `name citext NOT NULL UNIQUE`
- `abbreviation citext NOT NULL UNIQUE`
- `is_default boolean NOT NULL DEFAULT false`
- `is_active boolean NOT NULL DEFAULT true`
- `created_at`, `updated_at`
- One partial unique index permits only one row with `is_default = true`. Enforce `is_default = true` only when `is_active = true`; disabling the current default requires atomically selecting another active default.
- Seed exactly: Unit/`un`, Gram/`g`, Kilogram/`kg`, Millilitre/`ml`, Litre/`l`, Dose/`dose`.
- Setting a new default is one transactional RPC that unsets the previous default first.

#### `products`

- `id uuid PRIMARY KEY`
- `name text NOT NULL`
- `barcode text NULL UNIQUE`
- `category_id uuid NULL REFERENCES categories(id) ON DELETE RESTRICT`
- `subcategory_id uuid NULL REFERENCES categories(id) ON DELETE RESTRICT`
- `brand_id uuid NULL REFERENCES brands(id) ON DELETE RESTRICT`
- `tags text[] NOT NULL DEFAULT '{}'`
- `measurement_quantity numeric(12,3) NULL CHECK (measurement_quantity > 0)`
- `unit_id uuid NULL REFERENCES units(id) ON DELETE RESTRICT`
- `is_active boolean NOT NULL DEFAULT true`
- `created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `created_at`, `updated_at`
- `measurement_quantity` and `unit_id` must either both be null or both be non-null.
- If `subcategory_id` is present, its `parent_id` must equal `category_id`; a database trigger enforces this.
- Trim/deduplicate tags case-insensitively and reject empty tags.
- Search indexes: GIN trigram on normalized name, unique B-tree on normalized barcode, GIN on tags, and B-tree indexes on category, subcategory, brand, unit, and active state.
- Never hard-delete in normal use; set `is_active = false`. Admin hard delete is allowed only when no dependent rows exist.

#### `product_entries`

- `id uuid PRIMARY KEY`
- `product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT`
- `store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT`
- `price numeric(12,2) NOT NULL CHECK (price >= 0)`
- `original_price numeric(12,2) NULL CHECK (original_price >= price)`
- `quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0)`
- `created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `source_cart_id uuid NULL REFERENCES shopping_carts(id) ON DELETE SET NULL`
- `source_cart_item_id uuid NULL REFERENCES shopping_cart_items(id) ON DELETE SET NULL`
- `created_at`, `updated_at`
- A partial unique index on `source_cart_item_id` where non-null prevents duplicate checkout history.
- Index `(product_id, store_id, created_at DESC, id DESC)`.
- Ordinary users can create entries only through checkout. Admin/moderator may create, update, or delete entries only through audited RPCs; no role receives a broad direct mutation grant.

#### `shopping_lists`

- `id uuid PRIMARY KEY`
- `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `name text NOT NULL`
- `revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)`
- `created_at`, `updated_at`
- Do not impose uniqueness on list names; one owner may intentionally create multiple same-named lists.

#### `shopping_list_items`

- `id uuid PRIMARY KEY`
- `list_id uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE`
- `product_id uuid NULL REFERENCES products(id) ON DELETE RESTRICT`
- `product_name text NULL`
- `product_barcode text NULL`
- `planned_quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (planned_quantity > 0)`
- `added_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)`
- `created_at`, `updated_at`
- Require `product_id IS NOT NULL OR nullif(trim(product_name), '') IS NOT NULL`.
- Partial unique indexes enforce one non-null `(list_id, product_id)`, one non-null normalized `(list_id, product_barcode)`, and one normalized free-text name when both product/barcode are absent; the mutation RPC still locks and merges to handle precedence and races.

#### `shopping_carts`

- `id uuid PRIMARY KEY`
- `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `store_id uuid NULL REFERENCES stores(id) ON DELETE RESTRICT`
- `tracking_list_id uuid NULL REFERENCES shopping_lists(id) ON DELETE SET NULL`
- `tracking_check_state jsonb NOT NULL DEFAULT '{"manuallyChecked":[],"suppressedAutoMatch":[]}'::jsonb`
- `total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0)`
- `finalized_at timestamptz NULL`
- `checkout_idempotency_key uuid NULL UNIQUE`
- `revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)`
- `created_at`, `updated_at`
- A unique partial index on `(user_id) WHERE finalized_at IS NULL` guarantees one active owned cart per user.
- A check/trigger validates `tracking_check_state` keys and UUID-array values and rejects unknown keys or oversized arrays.
- Removing `tracking_list_id` in the authoritative RPC also resets tracking state in the same transaction.

`tracking_check_state` shape:

```json
{
  "manuallyChecked": ["list-item-uuid"],
  "suppressedAutoMatch": ["list-item-uuid"]
}
```

#### `shopping_cart_items`

- `id uuid PRIMARY KEY`
- `cart_id uuid NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE`
- `product_id uuid NULL REFERENCES products(id) ON DELETE RESTRICT`
- `product_entry_id uuid NULL REFERENCES product_entries(id) ON DELETE SET NULL`
- `product_name text NOT NULL`
- `product_barcode text NULL`
- `price numeric(12,2) NOT NULL CHECK (price >= 0)`
- `original_price numeric(12,2) NULL CHECK (original_price >= price)`
- `quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0)`
- `added_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)`
- `created_at`, `updated_at`
- Partial unique indexes support the deduplication precedence: one row per non-null `(cart_id, product_id)`, one per non-null normalized `(cart_id, product_barcode)`, and one normalized free-text name when both product/barcode are absent.
- Finalized-cart triggers/RPC authorization reject item insert, update, and delete.

#### `cart_shares`

- `id uuid PRIMARY KEY`
- `cart_id uuid NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE`
- `shared_with_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`
- Unique `(cart_id, shared_with_user_id)`.
- Do not store redundant `owner_id` or a stale email snapshot. Join `profiles` only inside authorized RPCs.
- Trigger/RPC rejects sharing with the owner and requires `created_by` to be the current cart owner.

#### `list_shares`

Same structure and constraints as `cart_shares`, using `list_id` and the list owner.

#### `resource_join_invites`

- `id uuid PRIMARY KEY`
- `resource_type text NOT NULL CHECK (resource_type IN ('cart','list'))`
- `resource_id uuid NOT NULL`
- `token_hash bytea NOT NULL UNIQUE`
- `created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `expires_at timestamptz NOT NULL`
- `revoked_at timestamptz NULL`
- `max_uses integer NULL CHECK (max_uses IS NULL OR max_uses > 0)`
- `use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0)`
- `created_at`, `updated_at`
- Store only a cryptographic hash of a minimum 128-bit random token. Show the plaintext token only at creation/copy time.
- A trigger validates that the resource exists and `created_by` owns it. Resource-deletion triggers remove its token rows.
- Joining locks the token row and rejects expired, revoked, exhausted, missing-resource, owner-self-join, or malformed tokens. Rejoining an existing membership is idempotent and does not increment `use_count`.

#### `cart_receipt_images`

- `id uuid PRIMARY KEY`
- `cart_id uuid NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE`
- `bucket_id text NOT NULL DEFAULT 'receipts' CHECK (bucket_id = 'receipts')`
- `object_path text NOT NULL UNIQUE`
- `mime_type text NOT NULL`
- `byte_size bigint NOT NULL CHECK (byte_size > 0)`
- `width integer NULL CHECK (width IS NULL OR width > 0)`
- `height integer NULL CHECK (height IS NULL OR height > 0)`
- `sort_order integer NOT NULL DEFAULT 0`
- `uploaded_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `created_at`, `updated_at`
- Never persist a signed URL or public URL.

#### `mutation_receipts`

Server-internal idempotency ledger:

- `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `mutation_id uuid NOT NULL`
- `operation text NOT NULL`
- `resource_type text NOT NULL`
- `resource_id uuid NULL`
- `result jsonb NOT NULL DEFAULT '{}'`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `expires_at timestamptz NOT NULL`
- Primary key `(user_id, mutation_id)`.
- Retain receipts longer than the maximum supported offline mutation age; use a minimum 90-day default and purge them with a scheduled job.
- No client table grants. Mutating RPCs atomically return the stored prior result for a repeated key.

#### `request_rate_limits`

Server-internal persistent rate-limit buckets:

- `action text NOT NULL`
- `key_hash text NOT NULL`
- `window_start timestamptz NOT NULL`
- `request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)`
- `blocked_until timestamptz NULL`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- Primary key `(action, key_hash, window_start)`.
- No raw IP/email/code values and no client grants.

#### `ai_usage_daily`

- `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`
- `usage_date date NOT NULL`
- `request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)`
- `created_at`, `updated_at`
- Primary key `(user_id, usage_date)`.
- Increment and limit checks occur atomically.

#### `audit_log`

Append-only, sanitized operational/security audit data:

- `id uuid PRIMARY KEY`
- `actor_user_id uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `action text NOT NULL`
- `entity_type text NOT NULL`
- `entity_id uuid NULL`
- `metadata jsonb NOT NULL DEFAULT '{}'`
- `created_at timestamptz NOT NULL DEFAULT now()`
- No update/delete grant to application roles.
- Metadata must exclude passwords, tokens, invite codes, raw receipt/OCR text, provider payloads, and unnecessary email addresses.

### 5.2 Safe view

Create `latest_product_prices` as a **security-invoker** view. It returns the most recent authorized entry per `(product_id, store_id)` with:

- entry id, product id, store id
- price, original price, quantity, created time
- product name, barcode, store name

Use deterministic ordering `created_at DESC, id DESC`. Explicitly grant only `SELECT` to `authenticated`; do not grant view mutation privileges.

### 5.3 RLS and table grants

Enable RLS on every table. The intended direct-access surface is:

| Table/group | Direct SELECT | Direct INSERT/UPDATE/DELETE |
| --- | --- | --- |
| `profiles` | Own row; admin may list through authorized server/RPC path | None; use profile/role RPCs |
| `invites` | Authorized admin/moderator listing only | None; use invite RPCs |
| stores/categories/brands/units/products/product entries | Authenticated read, respecting active/history requirements | None; use role-aware catalog RPCs |
| carts/lists and item tables | Do not rely on direct client access; use domain RPCs for owner and member alike | None |
| share tables/join-token tables | Owner/admin information only through RPCs | None |
| receipt metadata | Authorized cart participants through history RPCs | None |
| mutation/rate-limit/AI-usage/audit tables | No ordinary client access; admin audit view may be exposed through a sanitized RPC | None |

Additional requirements:

- Revoke broad schema/table/function privileges from `anon`, `authenticated`, and `PUBLIC`, then grant only what the documented API needs.
- Profile recovery insert cannot be a direct table policy; use `ensure_my_profile()`.
- Shared members cannot query protected cart/list tables directly. An empty direct result must never be interpreted as authorized empty content.
- Catalog/product-entry write RPCs enforce role and field-level rules even when RLS would otherwise permit a row.
- Finalized carts are immutable except receipt metadata and admin-only audited price corrections outside the cart row/item rows.

#### Realtime authorization

Enable RLS on `realtime.messages` and disable public access. Policies must:

- Accept only exact topics `cart-sync-{valid-uuid}` or `list-sync-{valid-uuid}`; reject malformed prefixes, extra segments, and invalid UUIDs.
- Permit cart-topic receive/send only to the cart owner or a current `cart_shares` member.
- Permit list-topic receive/send only when `can_access_list()` is true, including access through an attached cart only where the list mutation/read rules also allow it.
- Re-evaluate membership when a channel is re-subscribed. On revoke/leave, the app removes and recreates affected channels so cached authorization cannot linger.

### 5.4 `SECURITY DEFINER` and error contract

Every security-definer function must:

```sql
SECURITY DEFINER
SET search_path = ''
```

And must also:

- Fully qualify every schema/table/function reference.
- Validate `auth.uid()` and authorization before returning protected information.
- Avoid dynamic SQL; if unavoidable, use strict parameterization and identifier quoting.
- Lock rows in a consistent order for race-prone writes.
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC`, then explicitly grant only the intended role.
- Never grant a generic profile-by-email or profile-by-id lookup function to clients.
- Return stable machine-readable error codes such as `NOT_AUTHENTICATED`, `NOT_AUTHORIZED`, `RESOURCE_NOT_FOUND`, `CART_FINALIZED`, `REVISION_CONFLICT`, `INVITE_INVALID_OR_UNAVAILABLE`, `TOKEN_INVALID_OR_UNAVAILABLE`, `RATE_LIMITED`, or `VALIDATION_ERROR`.
- Avoid returning internal SQL text. Application wrappers translate error codes through i18n.

### 5.5 Required domain RPCs

Signatures may include typed composite/json results, but generated TypeScript must reflect the exact SQL definitions.

Cross-cutting mutation rule:

- Every user-triggered mutating RPC accepts `mutation_id uuid`.
- Update RPCs also accept `expected_revision integer` where stale writes are possible.
- The RPC checks/stores `mutation_receipts` in the same transaction and returns the previous result for an exact retry.

Auth/profile/admin:

- `get_my_profile()`
- `get_my_role()`
- `update_my_preferences(language, timezone, mutation_id)`
- `ensure_my_profile()`
- `admin_update_user_role(user_id, role, mutation_id)` with final-admin protection
- `admin_list_users(cursor, page_size)` — returns role, joined date, and inviter email without exposing a generic directory
- `create_invite(email, assigned_role, expires_at, mutation_id)` — returns the created invite/code to the authorized server action; the database function never calls an email provider
- `revoke_invite(invite_id, mutation_id)`
- internal/server-only `validate_invite_code(code, email)`
- Auth hook `before_user_created(event jsonb)`
- trigger `handle_new_user()`
- `get_sanitized_audit_page(cursor, page_size)` for admin only

Recipient sharing is resource-specific:

- `share_cart_with_email(cart_id, email, mutation_id)`
- `share_list_with_email(list_id, email, mutation_id)`
- Both normalize/resolve internally, reject owner/self/duplicate/ineligible targets, and return a generic `SHARE_TARGET_UNAVAILABLE` when appropriate.

Cart:

- `get_or_create_active_cart()` — concurrency-safe around the partial unique index
- `get_cart_by_id(cart_id)` — metadata plus owner email and current caller capability flags
- `get_cart_items(cart_id)` — includes product data and `added_by_email`
- `set_cart_store(cart_id, store_id, expected_revision, mutation_id)` — owner and active cart only
- `add_or_merge_cart_item(cart_id, item, expected_revision, mutation_id)`
- `update_cart_item(cart_id, item_id, updates, expected_item_revision, mutation_id)`
- `delete_cart_item(cart_id, item_id, expected_item_revision, mutation_id)`
- internal `recalculate_cart_total_locked(cart_id)`; do not expose a separate client race window
- `attach_tracking_list(cart_id, list_id, expected_revision, mutation_id)`; null clears state
- `get_tracking_state(cart_id)`
- `update_tracking_state(cart_id, state, expected_revision, mutation_id)`
- `get_shared_active_carts()` with owner email inline
- `revoke_cart_share(cart_id, member_user_id, mutation_id)`
- `leave_shared_cart(cart_id, mutation_id)`
- `create_or_rotate_cart_join_token(cart_id, expires_at, max_uses, mutation_id)`
- `preview_cart_join_token(token)` — read-only, generic invalid response
- `join_cart_by_token(token, mutation_id)` — locks/consumes token usage; rejects own cart
- `finalize_cart(cart_id, idempotency_key, mutation_id)` — authoritative transactional checkout

List:

- `get_lists_directory(cursor, page_size)` — owned/shared union with owner email inline
- `create_list(name, mutation_id)`
- `delete_list(list_id, mutation_id)` — owner only
- `get_list_by_id(list_id)`
- `get_list_items(list_id)` — product info plus `added_by_email`
- `add_or_merge_list_item(list_id, item, expected_revision, mutation_id)`
- `update_list_item(list_id, item_id, updates, expected_item_revision, mutation_id)`
- `delete_list_item(list_id, item_id, expected_item_revision, mutation_id)`
- `revoke_list_share(list_id, member_user_id, mutation_id)`
- `leave_shared_list(list_id, mutation_id)`
- `create_or_rotate_list_join_token(list_id, expires_at, max_uses, mutation_id)`
- `preview_list_join_token(token)`
- `join_list_by_token(token, mutation_id)`

History/receipts:

- `get_history_page(cursor_finalized_at, cursor_id, page_size)` — union owned/shared before ordering and pagination; stable order `(finalized_at DESC, id DESC)`; returns owner email, shared flag, store, total, and item count inline
- `get_history_cart_detail(cart_id)`
- `get_history_cart_items(cart_id)`
- `get_history_cart_receipts(cart_id)` — metadata/object paths only; never signed URLs
- `create_receipt_metadata(cart_id, metadata, mutation_id)` — owner only and only after a successful validated upload
- `reorder_receipts(cart_id, ordered_ids, mutation_id)` — owner only
- `delete_receipt(cart_id, receipt_id, mutation_id)` — owner only; the server action deletes the Storage object and metadata with compensating cleanup

Catalog:

- Search/read RPCs or security-invoker views that never expose inactive content contrary to role.
- `get_or_create_unverified_brand(name, mutation_id)` for regular users; it always returns/creates an unverified brand and handles concurrent same-name creation.
- Admin/moderator catalog mutation RPCs for stores, categories, brands, units, products, and price-entry corrections.
- Product create/update validates category/subcategory relation, package measurement/unit pairing, normalized barcode, tags, and role-specific edit permissions.

### 5.6 Private Storage contract

Create private bucket `receipts` with no public URL access.

Object path:

```text
{ownerUserId}/{cartId}/{randomUuid}.{validatedExtension}
```

Rules:

- Never use user-provided path segments or original filenames in object paths.
- Owner-only upload/delete policies verify the first two path segments against `auth.uid()` and an owned finalized cart.
- Server upload action validates authenticated owner, finalized cart, declared MIME type, actual magic bytes, maximum decoded size, maximum dimensions, and allowed formats (`image/jpeg`, `image/png`, `image/webp`, or another explicitly documented safe format).
- Strip EXIF metadata where practical and do not preserve geolocation metadata.
- Do not use overwrite/upsert; use random immutable names.
- Insert receipt metadata only after upload success. If metadata insertion fails, delete the just-uploaded object. If object deletion succeeds but row deletion fails, surface the failure and run an orphan reconciler.
- Generate signed URLs server-side only after `get_history_cart_detail` authorization. TTL comes from `RECEIPT_SIGNED_URL_TTL_SECONDS` and must be short.
- Shared members never receive bucket-wide or path-derived privileges; they receive only authorized, short-lived signed URLs.
- Test upload, owner view/delete, member view, cross-user denial, expired signed URL, invalid MIME, oversized file, and path traversal.

### 5.7 Schema delivery, migrations, seeds, and generated types

- `supabase/schema.sql` is the canonical full schema.
- Keep ordered deployment migrations in `supabase/migrations/`. Each migration must be generated/reviewed against the canonical schema rather than becoming a second divergent design.
- CI creates an empty local database, applies migrations, dumps the resulting application schema, and compares it to the normalized canonical `schema.sql` representation.
- `supabase db reset` must produce the same schema, seeds, functions, policies, and grants. Create circular cart-item/product-entry foreign keys with ordered `ALTER TABLE` statements after both tables exist.
- Seed the six canonical units and any minimum test fixtures separately from production user data.
- Generate `src/types/database.ts` with the Supabase CLI from the final schema. CI fails when regenerated types differ from committed types.
- Document Auth hook configuration, redirect allowlists, email templates, private Realtime settings, Storage bucket creation/policies, rate-limit configuration, and the first-admin bootstrap.

---
## 6. Feature specifications

### 6.1 Shopping cart (`/shopping`)

General behavior:

- On entry, call `get_or_create_active_cart()`. Handle concurrent calls by returning the row that won the unique active-cart constraint; never create two active carts for one owner.
- A store must be selected before adding an item. Active stores sort by `sort_order NULLS LAST`, then localized/name order.
- A shared member sees the store as read-only and cannot change store, finalize/delete the cart, manage shares, manage join tokens, or manage receipts.
- Owners and members use the same cart metadata/item RPC wrappers. Capability flags from `get_cart_by_id()` control the UI, but the RPC rechecks every operation.
- Every cart mutation locks the cart, verifies it is active, applies deduplication/update, recalculates total, increments relevant revisions, records the idempotency result, and commits before broadcasting.

#### Add item

- Product type-ahead searches active products using `latest_product_prices` plus products with no history, deduplicated by `product_id`.
- Search uses normalized/trigram matching. Search-all starts at two characters and is capped at 500 candidates; normal browse uses cursor/infinite pagination of 20.
- Free-text product name is allowed when no catalog product is selected.
- Required price is at least zero; quantity defaults to one and must be greater than zero.
- Price means the price of one purchased package/unit; quantity is the number of packages/units purchased and may use up to three decimal places.
- The discount modal accepts any sufficient combination of original price, final price, percentage, or amount and derives the rest according to section 6.9. Final price remains fixed when original price changes. `Remove Discount` clears `original_price`.
- Show item savings and total cart savings.
- Camera barcode scanning is dynamically imported with SSR disabled. Provide manual barcode entry when unsupported, denied, or unavailable.
- Barcode lookup order: normalized local active product, then server-side Open Food Facts lookup using `product_name_pt`, `generic_name_pt`, then `product_name`.
- Parse package quantity/unit from Open Food Facts into `measurement_quantity` and canonical unit abbreviations. The user reviews data before saving.
- Unknown barcode flow allows the user to type/edit the name and optional product details.
- Deduplication precedence is normalized barcode, then `product_id`, then case-insensitive normalized name. A match increments quantity and updates the current price/name/barcode according to the submitted values; otherwise insert.
- Adding ordinary free text does not create a product. A scanned-new product is created only when the user explicitly saves Product Details. Remaining missing products are resolved/created during checkout.

#### Product Details interaction

Keep the approximately 400-500 ms long-press Add interaction and hold animation, blocking the mobile context menu, but also provide a visible `Product details` button/menu action with the same result.

The modal includes:

- name
- barcode
- category
- subcategory limited to children of the chosen category
- brand type-ahead with controlled get-or-create
- package measurement quantity and unit, with the active default unit preselected
- comma/tag-token input

Permissions:

- Admin/moderator may edit existing product details through the authorized catalog RPC.
- Regular users may provide details only for a new/unselected product and may create only an unverified brand.
- Save & Add validates catalog fields server-side, creates/updates the product if authorized, then calls the cart item mutation with a separate idempotency key/dependency.

#### Cart list

Display:

- name
- quantity stepper and editable quantity
- unit/package price
- discount badge
- rounded line subtotal
- remove action with confirmation
- contributor avatar and email tooltip from the authorized RPC response
- `Prices by store` for known products, with the lowest current price highlighted

Use a ten-color per-session avatar palette assigned by first appearance and never persisted.

#### Transactional checkout (owner only)

The client calls only `finalize_cart(cart_id, idempotency_key, mutation_id)`. Inside one database transaction, the function:

1. Locks the cart and verifies current caller is owner, cart is active, store exists/is selected, and cart is nonempty.
2. If the same checkout idempotency key already completed, returns the stored finalized result.
3. Resolves missing products by normalized barcode first, then normalized name, then creates products according to role-safe defaults. Concurrent get-or-create operations must converge on one product/brand.
4. Updates every cart item with the resolved `product_id`.
5. Inserts exactly one `product_entry` per item for the selected store, protected by the unique source-cart-item constraint.
6. Sets each item's `product_entry_id`.
7. Recalculates total from rounded line subtotals using section 6.9.
8. Stores the checkout idempotency key, sets `finalized_at`, increments revision, writes an audit-safe event, and returns total/store/date/item count.
9. Commits all changes together. Any failure rolls everything back.

After success, show total and store name. The next ordinary `/shopping` visit creates/returns a new active cart. Existing members see the finalized cart in History while their share remains active.

#### Share panel (owner)

- Share by email through `share_cart_with_email`; validate syntax client-side, but treat the server response as authoritative.
- The function resolves the user internally. The UI must not use a generic email/profile lookup endpoint.
- List current members with email and revoke action.
- Create/rotate a join token with default seven-day expiry and an optional maximum-use count; copying shows `/shopping/join/{token}`.
- Rotating or revoking invalidates prior token links without changing the cart UUID.
- Join page GET previews a generic valid invitation and owner email after authorization-safe resolution; POST/server action performs membership creation.
- `Carts shared with me` supports open and leave with confirmation. Leaving immediately removes active/history/receipt access.

### 6.2 List tracking on a cart

- Any current participant may attach a list they can access under `can_access_list()`. The owner may also attach through `?list=` after a confirmation/authorization check.
- `attach_tracking_list` persists the relationship and increments the cart revision. Passing null clears both the list and tracking state in one transaction.
- Panel is collapsible and emerald-themed.
- Auto-match by exact `product_id`; otherwise compare normalized lowercase/whitespace-folded names when one contains the other.
- Matched rows show a check plus text/icon state; unmatched rows show an accessible unchecked state. Display `done / total` and announce progress changes.
- Manual check/uncheck persists. Unchecking an auto-match adds that list item to `suppressedAutoMatch` so it does not immediately rematch.
- When one new cart item matches two or more list items, show a modal to choose which list item(s) to mark; unselected candidates become suppressed.
- Persist the complete validated state after a 500 ms debounce. Skip the first-mount write.
- Updates include `expected_revision`; a conflict refetches authoritative state and asks the user to retry/merges only when deterministic.
- Broadcast only the cart ID/revision/event ID; all clients refetch state through the RPC.

### 6.3 Shopping lists

- Create and delete list: owner only; deletion requires confirmation.
- Directory unions owned and shared lists before cursor pagination and includes owner email/shared badge inline.
- Items can use catalog search or free text. Optional barcode lookup may create a product only after explicit user confirmation.
- Quantity is positive with up to three decimal places.
- Deduplication uses product ID, then barcode, then normalized free-text name and is performed transactionally in `add_or_merge_list_item`.
- Members may add/edit/remove list items through RPCs but cannot rename/delete the list, manage shares, or manage join tokens.
- Owner shares by email, lists/revokes members, and creates/rotates `/lists/join/{token}` links.
- Members may leave with confirmation; access ends immediately.
- Show contributor avatars/emails from authorized results.
- Use private `list-sync-{listId}` Broadcast only as invalidation; refetch after events.

### 6.4 Products catalog

- Search with cursor-based infinite scroll.
- Show latest price, store, original price, category, subcategory, brand, unit, tags, and price per package unit when measurement/unit are available.
- Add product supports barcode scan and reviewed Open Food Facts suggestions.
- Product fields: name, barcode, category, valid child subcategory, brand, tags, package measurement, unit.
- Product detail shows deterministic per-store price history.
- Admin/moderator may edit fields, enable/disable, and create/update/delete audited price entries with store, price, original price, quantity, and effective date.
- Admin may hard-delete only when no dependencies exist; normal lifecycle uses `is_active = false`.
- Category/brand/unit/store names remain visible on historical records when disabled.
- Price-entry update authorization must have both `USING` and `WITH CHECK`, plus an RPC role check and audit event.

### 6.5 History and receipts

#### History list/detail

- `get_history_page` is the only history-list source. It unions owned and currently shared finalized carts, then sorts and cursor-paginates by `(finalized_at DESC, id DESC)`.
- Each row includes date, store, total, item count, shared flag, and owner email without N+1 profile requests.
- Detail uses the three member-authorized history RPCs for cart metadata, items, and receipt metadata.
- Direct receipt-table access is not a fallback.
- If an owner revokes a share or a member leaves, the member can no longer open that finalized cart or generate new receipt URLs.

#### Receipt upload/view/delete

- Only the owner may upload, reorder, or delete receipts; authorized members may view them.
- Upload/take-photo uses a server action with the section 5.6 validation contract and a maximum decoded body/file size of 5 MB unless the validated environment lowers it.
- Store only private object paths in the database.
- The history page requests fresh signed URLs from a server action after current membership is verified. Never persist or cache them.
- Receipt deletion removes the Storage object then metadata; failures use compensating cleanup and an orphan-reconciliation job.

#### Optional AI receipt import

- Hide or disable AI import when no provider key is configured; photo upload remains available.
- Before the first AI use, show an explicit disclosure that the selected receipt will be sent to an external provider and obtain affirmative consent. Link to `/privacy`.
- AI produces a runtime-schema-validated structured proposal only. It never mutates cart/history automatically.
- Extract line items and compare with cart items. Show flags: no match, price differs, quantity differs.
- User can accept, reject, or accept all proposed matches; accepted changes still use authorized, idempotent server actions.
- Treat all receipt/OCR text as untrusted data, never as instructions. Do not include secrets, unrelated account data, or hidden system context in provider requests.
- Apply the atomic per-user/day usage limit before provider invocation.
- Prefer Anthropic. Use OpenAI only for explicitly classified retriable provider errors/timeouts; do not call both after an ambiguous success/timeout without a request id/cost safeguard.
- Do not log images, OCR text, prompts containing receipt content, or provider responses. Delete temporary derivatives promptly.

### 6.6 Admin tabs

Tabs: Users | Stores | Categories | Brands | Units. A sanitized Audit view may be admin-only.

- **Users:** paginated users, role, inviter, joined date. Admin-only role change with final-admin protection. Invite form: role, expiry days default seven, optional email, generate versus send.
- **Stores:** add, rename, sort order, enable/disable. No normal hard delete.
- **Categories:** tree; add optional parent, rename, enable/disable. Disabling a parent transactionally disables descendants. Admin delete only when no products/children reference it.
- **Brands:** add verified, rename, enable/disable. `Awaiting confirmation` section for unverified brands; confirm through an audited RPC. Admin delete only when no product references it.
- **Units:** add/edit name and abbreviation, enable/disable, set default transactionally. Admin delete only when no product references it.
- All pages use cursor pagination or bounded queries; no unbounded admin table reads.

### 6.7 Offline and PWA consistency model

#### Dexie schema

Namespace all rows by authenticated `user_id`. At minimum define:

- `mutations`: `mutation_id`, `user_id`, resource type/id, local timestamp, operation, validated payload, dependency IDs, retry count, next-attempt time, last error code, and status `pending | syncing | failed | completed`.
- `offlineCartItems`: local representation for the active cart, including temporary IDs and server revision when known.
- `idMap`: temporary local ID to server UUID mapping.
- `meta`: current user/schema/cache version only; never tokens or provider credentials.

#### Queue behavior

- Generate a UUID mutation ID before optimistic local application. The same ID is sent on every retry. Mutations older than 30 days become visible `failed` items requiring manual retry/review rather than silent replay.
- Preserve FIFO order per resource/dependency chain. A permanently failed mutation pauses its dependents but does not block independent resources.
- Process eligible unrelated mutations after one mutation fails.
- Retry transient network/5xx/rate-limit failures with bounded exponential backoff and jitter. Honor server retry hints.
- Move validation, authorization, finalized-resource, and unrecoverable revision errors to a visible failed queue with translated recovery actions.
- An offline update/delete that depends on a local insert cannot run until the insert succeeds and the temporary ID is mapped.
- Server deduplication through `mutation_receipts` makes reconnect/reload/retry safe.
- Conflict policy:
  - finalized resource rejects all stale item/store/tracking mutations;
  - deletion wins over a stale update;
  - quantity/price/name changes require an expected revision and return `REVISION_CONFLICT` rather than silent last-write-wins;
  - deterministic add/merge operations may safely refetch and retry with the same mutation ID only when the server contract allows it.
- After queue processing, reconnect, foreground/tab focus, or a Realtime gap, refetch authoritative RPC state.
- On logout/account switch, stop synchronization, remove channels, clear all user-scoped IndexedDB rows/cache entries, and verify no previous-user data renders.

#### Service worker/cache policy

Cache only:

- versioned static JavaScript/CSS/fonts generated by the app
- manifest and icons
- a static offline fallback shell that contains no user data
- explicitly reviewed public static assets

Never cache:

- any Supabase URL or response
- Auth callback/recovery pages
- protected HTML documents
- RSC/Flight responses or route prefetches containing user data
- Server Action requests/responses
- signed receipt URLs/images
- AI/email/Open Food Facts personalized/proxied responses unless a dedicated safe server cache is explicitly defined

Version cache names per build, remove obsolete caches on activation, and verify these rules in a production Playwright run.

### 6.8 i18n

Files: `src/i18n/en.json` and `src/i18n/pt.json`.

- `TranslationKey = keyof typeof en`.
- `useT()` returns `{ locale, t, setLocale }`.
- Protected layout initializes from `profiles.language`; Auth layout defaults to `pt`.
- Translation files must have identical key sets; CI compares them.
- Cover navigation, Auth, login version/changelog labels, validation, cart, scanner, discount, lists, products, history, admin, tracking, offline queue, receipts, privacy, export/deletion, password reset, and all stable server error codes.
- No hardcoded English/Portuguese UI strings outside deliberate brand/proper names.
- Support interpolation and pluralization without assembling translated sentences from fragments.
- Locale parsing accepts decimal comma for Portuguese and decimal point for English; persist a canonical decimal representation.

### 6.9 Money and discount calculation contract

Definitions:

- `price` and `original_price` are prices for one purchased package/unit, not line totals.
- `quantity` is the number of purchased packages/units.
- Persist all monetary values at two decimal places and quantities at up to three decimal places.
- Use decimal/integer-scaled arithmetic. Do not use JavaScript `number` arithmetic for authoritative calculations.

Authoritative formulas:

```text
line_subtotal = round_half_up(price * quantity, 2)
line_original_subtotal =
  original_price is null
    ? line_subtotal
    : round_half_up(original_price * quantity, 2)
line_savings = line_original_subtotal - line_subtotal
cart_total = sum(already-rounded line_subtotal values)
cart_savings = sum(already-rounded line_savings values)
```

Rules:

- Round each line before summing. Do not sum raw fractions and round only once at cart level.
- `original_price` is null or greater than/equal to `price`.
- Percentage is between zero and 100 inclusive.
- Discount amount is between zero and original price inclusive.
- A `100%` discount yields final price zero; deriving an original price from final price plus `100%` is undefined and must require another input.
- When original price changes, preserve the user's fixed final price and recompute amount/percentage.
- `Remove Discount` sets `original_price` to null and clears derived discount inputs.
- Client preview and PostgreSQL result must pass the same shared vector tests, including:
  - `0.125 -> 0.13`
  - fractional quantities
  - zero price
  - 0% and 100%
  - repeated input recalculation without drift
  - changing original price while final price stays fixed
  - Portuguese comma and English point input

### 6.10 External integration contracts

#### Open Food Facts

- Call a fixed documented HTTPS origin/API version from the server, never from arbitrary user-provided URLs.
- Request only required fields.
- Send `OPENFOODFACTS_USER_AGENT` containing app name, version, and monitored contact.
- Use timeout/abort handling and bounded retries for safe retriable responses.
- Cache successful barcode responses briefly and negative results for a shorter period; never let this cache contain user-specific data.
- Send appropriate country/language parameters for Portugal/Portuguese where supported.
- Normalize quantity/unit into the canonical schema but treat all external data as a suggestion requiring user confirmation.
- Display required source attribution/licensing notice in the product/scanner UI or About/Privacy area.

#### AI providers

- Use server-only adapters behind one typed interface.
- Validate structured output with a runtime schema; reject extra/malformed fields.
- Configure explicit timeout, maximum image size, and bounded retries.
- Classify provider errors as retriable, non-retriable, ambiguous, or quota/cost blocked.
- Include a request ID/idempotency record so an ambiguous timeout does not silently trigger duplicate provider spending.
- Do not retain provider payloads beyond what is needed for the live user-reviewed response.

#### Transactional email

- Use a server-only provider adapter with typed results and stable errors.
- Invite messages contain the custom signup link; password recovery remains Supabase Auth-managed.
- Validate `EMAIL_FROM` and provider configuration at startup when email sending is enabled.
- Log only provider delivery/message ID, template type, status, and sanitized internal invite ID; do not log body, token/code, or full recipient address.
- A delivery failure never consumes/revokes an invite.

### 6.11 Realtime consistency and authorization

- Use Supabase Broadcast, not `postgres_changes`, on `cart-sync-{id}` and `list-sync-{id}` with `private: true`.
- Prefer database-triggered broadcast after committed domain mutations so events cannot announce rolled-back state.
- Event payload contains only: `event_id`, resource ID, resource revision, mutation type, and optional changed entity ID. Do not broadcast item names, prices, emails, receipt paths, or full state.
- Validate every incoming payload with a runtime schema.
- Deduplicate `event_id`; ignore a revision not newer than local authoritative revision.
- On a valid newer event, refetch through the authorized RPC. Never apply a broadcast payload directly as trusted state.
- Refetch after initial subscribe, reconnect, browser foreground, detected revision gap, queue completion, and failed optimistic mutation.
- Remove channels on unmount, resource switch, logout, account switch, share revocation, or leave.
- On membership changes, refresh session authorization as needed and recreate affected private channels so cached Realtime authorization does not outlive the share.
- Subscription failure shows translated degraded-sync status; normal HTTP/RPC refresh remains functional.

### 6.12 Privacy, retention, export, and deletion

Provide a clear `/privacy` notice covering:

- account email/profile and sharing relationships
- shopping lists, carts, price history, and receipts
- Open Food Facts requests
- optional Anthropic/OpenAI processing
- analytics categories
- retention and deletion behavior
- user access, correction, export, and deletion controls

Data minimization:

- Never place tokens, passwords, raw IPs, invite codes, receipt OCR text, or full provider payloads in logs/audit metadata.
- Do not enable session replay or analytics capture of forms/receipt content.
- Keep only fields required for product behavior, security, support, or an explicitly documented retention rule.

Export:

- `/profile` offers a server-generated machine-readable export (JSON, optionally zipped with owned receipt files) after reauthentication.
- Export includes the user's profile/preferences, owned lists/carts/items, active shares, invites created by the user, and attributable catalog contributions where practical.
- Export never includes another user's private data beyond email addresses already visible through active collaboration.

Account deletion:

- Require reauthentication and a destructive confirmation.
- Reject deletion when the account is the final remaining admin.
- Delete the Auth user and profile through a server-only administrative flow.
- Delete all owned active/finalized carts, lists, shares, join tokens, receipt metadata, and receipt Storage objects. Warn that collaborators will lose access and offer export first.
- Delete unused invites created by the user. Used invite history may retain timestamps with creator/user references set null.
- User-created catalog products/brands and anonymized price entries may remain to preserve shared catalog utility; set creator references null and remove source-cart references through FK behavior.
- Audit events may retain event type/time/entity category with actor set null and no email/content.
- Clear IndexedDB, Cache Storage, local/session storage, cookies that the app controls, and active Realtime channels on the current device.
- Run an orphan-object check so deleted receipt rows do not leave private files behind.

Retention:

- Document configurable receipt retention and operational-log retention values in deployment configuration/privacy text.
- Temporary AI transformations are deleted immediately after the reviewed response or within a documented short failure window.
- Rate-limit/idempotency records expire on documented schedules and are purged by a scheduled job.

### 6.13 Version display and public changelog

- The login footer displays the exact latest released version from `CHANGELOG.md` as `Meu Cesto vX.Y.Z`.
- `/changelog` renders `src/generated/changelog.ts` newest first and highlights the version running in the current build. The generated data must come only from root `CHANGELOG.md`.
- Do not read the repository filesystem on each request. Convert repository-authored Markdown during `version:sync`; when rendering entry Markdown, use a safe pipeline with raw HTML disabled or sanitized. Do not execute embedded scripts/components or fetch arbitrary remote content.
- Each release shows its version, ISO release date, and nonempty change categories. Preserve the order and wording of entries from `CHANGELOG.md`.
- The route is public so users can inspect changes before signing in. It must not expose internal-only secrets, personal information, tokens, raw vulnerability reproduction steps, or provider credentials.
- The page includes a clear path back to login and uses the Auth layout's Portuguese default before a user preference exists.
- A contributor runs `version:sync` while preparing the change and commits the synchronized outputs. CI and `prebuild` run read-only `version:verify` before compiling, so a deployment cannot silently display the previous version or mutate release files during the build.
- The service-worker cache namespace incorporates `APP_VERSION`, but it imports/receives the generated value rather than defining another version string. Activation removes obsolete versioned caches.

---

## 7. Architecture (clean version)

```text
src/app/...                              routes, layouts, route handlers
src/app/changelog/page.tsx               public changelog rendered from repository data
src/features/{auth,shopping,lists,products,history,stores,users,categories,brands,units,privacy,changelog}
src/components/{layout,ui}
src/i18n/{en.json,pt.json}
src/generated/app-version.ts             generated current release metadata; never hand-edit
src/generated/changelog.ts               generated structured release history; never hand-edit
src/lib/version.ts                       typed wrapper for generated release metadata

src/lib/supabase/{server,client,admin,middleware}
src/lib/auth/{guards,redirects,invite-signup}
src/lib/email/{index,provider,types}
src/lib/rate-limit/{index,types}
src/lib/barcode/{lookup,normalize,open-food-facts}
src/lib/ai/{index,anthropic,openai,schema,types}
src/lib/offline/{db,sync,queue,conflicts,cart-actions}
src/lib/realtime/{channels,events,schemas}
src/lib/storage/{receipts,validation,signed-urls}
src/lib/validation/
src/lib/user-colors.ts
src/lib/money.ts                         decimal parsing/rounding/discount vectors
src/lib/env.ts                           startup environment validation
src/lib/idempotency.ts

src/types/database.ts                    generated by Supabase CLI
supabase/schema.sql                      canonical complete DDL
supabase/migrations/                     synchronized deployment migrations
supabase/tests/                          SQL/pgTAP RLS, grants, functions, concurrency

CHANGELOG.md                              authoritative application release history
package.json                              version mirrors latest released changelog entry

tests/unit/                              money, validation, RPC wrappers, tracking, offline, changelog/version parsing
tests/e2e/                               Playwright acceptance, PWA, accessibility
scripts/bootstrap-admin.*
scripts/verify-schema-parity.*
scripts/sync-app-version.ts
scripts/verify-app-version.ts
```

### 7.1 Data-access and trust boundaries

- Browser Supabase client uses only the publishable key and authenticated user session.
- Secret-key/admin client exists only in a `server-only` module and is used for narrowly justified operations such as Auth deletion, hook-support tasks, signed receipt URLs after authorization, and provider integrations.
- Cart/list metadata, items, shares, tracking, finalization, and history use domain RPCs for owners and members alike.
- Catalog reads may use safe views/read RPCs. Catalog mutations use role-aware RPCs.
- Server Actions validate inputs with runtime schemas, call typed wrappers, and return a discriminated result such as `{ success: true, data } | { success: false, errorCode, fieldErrors? }`.
- `revalidatePath` is UI cache invalidation only; it is never part of the data-integrity algorithm.
- Parallelize independent reads with `Promise.all`, but do not parallelize steps that must be one transaction or preserve lock order.
- Never log tokens, passwords, invite/join secrets, raw IP/email lookup inputs, receipt content, or third-party payloads.
- Add a Content Security Policy and security headers appropriate to camera, Storage images, Supabase, and configured providers; do not use permissive wildcards without justification.
- Validate all external URLs against fixed origins to prevent SSRF and open redirects.

### 7.2 Module boundaries and size discipline

- Split shopping into at least cart shell, store selector, add-item form, scanner, Product Details, discount editor, cart item row/list, share panel, tracking panel, checkout flow, offline status, and realtime controller.
- Keep provider adapters, database wrappers, and UI components separate.
- No single feature file should become a repository-scale coordinator; extract when responsibilities diverge or tests require unrelated mocks.
- Generated files are not hand-edited.

---

## 8. UX details to preserve and complete

- Store-required empty hint: translated equivalent of `Select a store above...`.
- Helpful empty states for cart, list, history, shares, failed offline queue, and no search results.
- Confirm dialogs for delete, remove, leave, revoke, rotate link, checkout, receipt deletion, and account deletion.
- Join confirmation states the resource type and owner email without mutating membership on page load.
- Shared cart/list headers show owner email and current capability limitations.
- Discount fields live-recalculate using section 6.9 and show errors without clearing valid user input.
- Scanner explains where to point the camera, permission state, unsupported fallback, and manual entry.
- Brand search clearly distinguishes existing, awaiting confirmation, and `Create unverified brand`.
- Product lookup distinguishes `Already in Meu Cesto` from `Found on Open Food Facts`.
- Keep the hold-to-edit hint, plus the visible accessible Product Details action.
- Sync status distinguishes offline, pending, syncing, failed, conflict, and up-to-date.
- Do not show optimistic success for checkout, share, role, invite, receipt, or account-deletion operations until the authoritative result succeeds.
- Destructive and security-sensitive errors remain visible long enough to act and are not represented only by transient toasts.
- Login shows a muted but readable `Meu Cesto v{APP_VERSION}` footer linked to the public changelog; it is not hidden behind a menu or available only after authentication.
- The changelog page highlights the running release and provides a clear return-to-login action.

---

## 9. Automated acceptance and security tests

All tests are executable automation, not a manual checklist. Use deterministic fixtures and isolated test users. Never run destructive suites against production.

### 9.1 Unit tests (Vitest)

At minimum cover:

1. Decimal parsing for `pt-PT` commas and `en-GB` points, including invalid mixed separators.
2. Half-up money vectors, per-line-before-sum behavior, fractional quantities, 0%/100%, and no recalculation drift.
3. Discount field derivation and the rule that final price remains fixed when original price changes.
4. Barcode normalization preserving leading zeroes and unit normalization to `un/g/kg/ml/l/dose`.
5. Tracking exact-product/name matching, suppression, and multi-match candidates.
6. Runtime validation for server-action inputs, AI structured output, and Realtime payloads.
7. Trusted-origin and relative-redirect validation; reject open redirects and arbitrary external URLs.
8. Offline queue dependency ordering, per-resource FIFO, independent failure continuation, retry classification, temporary-ID mapping, and logout clearing.
9. Idempotent RPC wrapper behavior for duplicate mutation IDs.
10. Receipt MIME/magic-byte/size/dimension validation and unsafe filename/path rejection.
11. Identical translation-key sets and stable server-error-code translations.
12. Changelog parser accepts the required heading/category format, selects the newest released version rather than `[Unreleased]`, enforces monotonic SemVer/date rules, and generates deterministic version constants.
13. Version verification detects package/generated/cache mismatches, a changed repository without a new release entry, and attempts to rewrite published history.

### 9.2 SQL/pgTAP or equivalent database tests

Test the database directly with owner, member, unrelated user, moderator, admin, anon, and privileged test roles:

1. Every application table has RLS enabled; sensitive tables have no unexpected direct grants.
2. Every security-definer function has empty search path, no `PUBLIC` execution, and only intended grants.
3. `latest_product_prices` is security-invoker, deterministic on equal timestamps, and leaks no unauthorized rows.
4. User cannot update profile role, email, ID, or inviter; preference RPC changes only language/timezone.
5. `ensure_my_profile` cannot create another user's profile, choose a role, or choose an inviter.
6. Admin role change works; moderator/user cannot call it; final admin cannot be demoted, deleted, or self-delete without another admin.
7. Invite validation rejects malformed, expired, revoked, used, role-invalid, and email-mismatched codes.
8. Two concurrent signups with one invite result in exactly one Auth/profile/invite consumption; the loser leaves no Auth user.
9. Moderator cannot create admin/moderator invites; admin can. Public validation returns a generic result.
10. Persistent rate-limit buckets block repeated invite/password-reset attempts and store only hashed keys.
11. Two concurrent active-cart creations yield one active cart and both callers receive it.
12. Owner/member/nonmember cart reads and writes match the capability contract; no direct-query fallback is possible.
13. Simultaneous equivalent cart/list item adds merge deterministically and do not create duplicates.
14. Stale expected revisions return `REVISION_CONFLICT`; delete wins over stale update.
15. Finalized cart rejects item, store, and tracking mutations for all non-database-owner roles.
16. `finalize_cart` rolls back completely on an injected mid-transaction failure.
17. Repeating checkout/mutation idempotency keys returns the prior result and creates no duplicate product entries.
18. Checkout creates exactly one source-linked `product_entry` per item and totals equal rounded line sums.
19. `original_price < price`, invalid quantities, blank names, invalid category/subcategory pairs, invalid tracking JSON, and category cycles are rejected.
20. Regular-user brand creation always creates/returns `is_verified = false`; moderator/admin management behaves as specified.
21. Share-by-email resolves internally, prevents enumeration/self-share/duplicates, and ordinary clients cannot call generic profile lookups.
22. Join tokens are hashed, expire/revoke/rotate correctly, enforce max uses, and do not count an already-existing member twice.
23. Possession of a resource UUID without a share/token grants no read, mutation, history, receipt, or Realtime access.
24. Revoking/leaving removes active and finalized-history access immediately.
25. History unions owned/shared carts before cursor pagination with no duplicate/skipped rows under stable cursors.
26. Receipt metadata and signed-URL authorization allow owner/member view as specified and deny unrelated users; only owner can mutate metadata.
27. Realtime topic policies reject malformed topics and nonmembers, allow current authorized participants, and mirror attached-list access rules.
28. Account deletion FK behavior anonymizes retained catalog/price contributions and removes owned collaboration data.
29. Audit log is append-only and sanitized fields do not accept prohibited secret/content keys.
30. Canonical seeds produce exactly one default unit and the required abbreviations.

### 9.3 Playwright end-to-end tests

1. Invite signup creates the Auth user/profile with the assigned role; bad/expired/revoked/mismatched/used code is rejected without an orphan account.
2. Repeated invalid invite validation receives a translated rate-limit response.
3. Invite email uses the custom signup URL; simulated mail failure leaves the invite usable.
4. Password reset request is enumeration-safe; valid link changes password; expired/replayed link is rejected. Logged-in password change rejects an incorrect current password and succeeds with a valid current password plus matching new confirmation.
5. Language/timezone changes persist; Auth defaults to Portuguese; `<html lang>` and number/date formatting follow the selected locale.
6. Owner selects store, adds by product search/free text/barcode, exercises deduplication, edits quantity/price, applies/removes discounts, and sees matching preview/persisted totals.
7. Accessible Product Details works through long-press and through keyboard-visible action.
8. Checkout creates products/price entries and finalizes atomically; repeated submit/reload does not duplicate entries; next visit gets a new empty active cart.
9. Share by email with two browser contexts: member reads/adds/edits/removes through RPCs but cannot change store, checkout, delete, manage members/tokens, or manage receipts.
10. Token join requires confirmation POST, works before expiry, and fails after rotation/revocation/expiry/exhaustion.
11. A nonmember with the cart/list UUID cannot subscribe to private Broadcast or fetch protected state.
12. Realtime updates both authorized clients; duplicate/out-of-order event IDs do not corrupt state; reconnect performs authoritative refetch.
13. Removing a member closes/reauthorizes their channel and immediately removes active/history/receipt access.
14. Shared-list attach, exact/name auto-match, multi-match modal, manual check/uncheck, suppression, conflict handling, and refresh persistence work for both users.
15. List share by email/token, member edits, leave, and owner revoke behave as specified.
16. Regular user creates an unverified brand; admin sees it awaiting confirmation and confirmation succeeds.
17. Admin edits a price entry; the change persists and an audit event exists. Moderator cannot perform admin-only deletes/invites/role changes.
18. History pagination interleaves owned/shared finalized carts correctly across multiple pages with no repeat dump of shared carts.
19. Member can open authorized finalized detail and view signed receipt image; unrelated user cannot. Signed URL expiry requires refresh.
20. Owner upload rejects fake MIME, oversized, and malformed images; valid upload strips/does not expose sensitive metadata where supported; delete removes object and row.
21. AI UI is hidden/disabled without keys. With a mocked provider, consent is required, invalid structured output is rejected, no automatic mutation occurs, and daily limit/fallback rules hold.
22. Open Food Facts timeout/negative result falls back gracefully; reviewed suggestions preserve leading-zero barcodes and canonical units.
23. Offline add creates a queued optimistic item; reload preserves it; reconnect syncs exactly once. One permanent failure does not block an unrelated mutation.
24. Logout/account switch clears IndexedDB/cache/user state and prevents previous-user data from flashing.
25. Production service worker caches the static shell/assets but not protected HTML, RSC, Supabase, Auth callbacks, Server Actions, signed receipt URLs, or AI responses.
26. Keyboard-only flows cover login/signup, cart add/edit/checkout, share/token modal, tracking, receipt view, profile export/delete dialogs, with focus trap and restoration.
27. Automated accessibility scan has no serious/critical violations on core routes; reduced-motion and live-region behavior are asserted where practical.
28. Data export contains the documented user data and excludes another user's unrelated private data.
29. Account deletion requires reauthentication, warns about collaborator impact, removes owned data/receipts, clears local state, and blocks deletion of the final admin.
30. Login displays the exact latest released changelog version in every form state; the link opens `/changelog`, the running release is highlighted, entries are newest first, and the page returns to login accessibly.
31. A build with deliberately mismatched changelog/package/generated values fails before deployment rather than rendering a stale login version.

### 9.4 Static and build gates

CI must fail on:

- TypeScript errors, explicit `any`, `@ts-ignore`, or unsafe privileged-module imports from client code.
- ESLint errors or committed commented-out implementation blocks/TODO placeholders in required flows.
- Missing translation keys or untranslated literal UI strings in feature components.
- Generated database types differing from the schema.
- Schema/migration parity drift.
- Unexpected direct table/function grants.
- A production build, service-worker build, or Playwright run failure.
- Any source/schema/config/dependency/test/documentation/translation change without a new released `CHANGELOG.md` version relative to the target branch.
- A malformed/non-monotonic changelog version, modified historical release, or mismatch among changelog, `package.json`, generated version/changelog modules, service-worker cache source, release tag metadata, and login display source.

Required scripts/commands, with exact project-specific names documented in the README:

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
```

---

## 10. What not to port or introduce

- Nested `lista-app/lista-app` project tree.
- Column-existence retry paths or schema-version guessing in application code.
- RPC/direct-query fallbacks "in case migration was not applied".
- Incomplete `schema.sql` or migrations that become the undocumented real schema.
- Public receipts bucket, stored signed URLs, predictable object paths, or user filenames as paths.
- Native `inviteUserByEmail` mixed with the custom invite-code signup flow.
- Signup that creates an Auth user before invite consumption can be guaranteed.
- Direct self-service profile role/email/inviter updates.
- Generic client-callable profile lookup by email/ID.
- Resource UUIDs used as permanent join secrets.
- Nontransactional checkout spread across browser/server calls.
- Broad table mutation grants for cart/list items, shares, receipts, finalization, or price history.
- Security-definer functions with a mutable/default search path or execution granted to `PUBLIC`.
- Views that bypass RLS.
- In-memory-only rate limiting in a horizontally scaled deployment.
- Plain JavaScript floating-point money totals.
- Realtime payloads treated as authoritative state or channels left public.
- Offline retries without mutation IDs, account isolation, dependency handling, or conflict policy.
- Service-worker caching of authenticated documents, RSC, signed URLs, or Server Actions.
- Provider calls/logging that send or retain more receipt/account data than required.
- A 1,200-line shopping page; split it into focused feature components/controllers.
- Hand-edited generated database types.
- History merge bug: paginated owned carts plus every shared cart on every page.
- Silent optimistic success for security-sensitive/destructive actions.
- A hardcoded app version in the login component, translation JSON, environment variable, database row, manifest, or service worker.
- A merged change without a new Semantic Version and complete `CHANGELOG.md` entry.
- Editing or deleting an already published changelog release instead of recording the correction in a newer version.
- A public changelog that renders unsafe raw HTML or exposes secrets, PII, tokens, or vulnerability reproduction details.

---

## 11. Delivery and definition of done

Implement incrementally in this dependency order:

1. Runtime/tooling, version/changelog automation, environment validation, local Supabase, canonical schema, grants/RLS tests, seeds, bootstrap.
2. Atomic invite Auth flow, login/recovery, profiles/preferences/roles.
3. Cart domain RPCs, money rules, product search/add, transactional checkout.
4. Lists and list-item domain RPCs.
5. Email/token sharing, private Realtime authorization, post-commit invalidation/refetch.
6. Tracking state and conflict handling.
7. Catalog/admin workflows and audited corrections.
8. History union pagination, private receipts, signed-URL access.
9. External Open Food Facts and optional AI adapters.
10. PWA/offline queue and production cache verification.
11. i18n, timezone/locale parsing, accessibility, privacy/export/deletion.
12. Full automated test suite, schema parity verification, security review, final documentation.

The delivered repository must include:

- Complete application code with no required-flow placeholders.
- Canonical `supabase/schema.sql`, synchronized migrations, database tests, seeds, Storage/Realtime/Auth configuration instructions.
- Generated TypeScript database types.
- `.env.example`, exact runtime/package-manager pins, committed lockfile.
- Root `CHANGELOG.md`, synchronized `package.json#version`, generated version and structured-changelog modules, version sync/verification scripts, public changelog route, and login version footer.
- First-admin bootstrap and schema-parity scripts.
- README setup/deployment/test instructions.
- Automated Vitest, SQL, and Playwright coverage required above.
- Privacy notice and data lifecycle behavior implemented, not merely documented.

The final implementation report must state:

- Current application release version and the exact `CHANGELOG.md` entry delivered.
- Exact dependency/runtime versions used.
- Environment/setup steps and external service configuration.
- Schema/migration parity status.
- Commands executed and their outcomes.
- Test totals and any intentionally skipped environment-dependent tests, with a concrete reason.
- Security-sensitive configuration verified: private Storage, private Realtime, Auth hook, grants, redirect allowlist, service-worker exclusions.
- Any optional feature deliberately disabled because its optional key/provider is absent.
- No hidden TODOs, unresolved placeholders, silent fallbacks, or known acceptance-test failures.

PROMPT END
