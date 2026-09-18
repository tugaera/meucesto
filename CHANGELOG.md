# Changelog

## [1.0.3] - 2026-09-19

### Added
- Added an idempotent reference data import script for common Portuguese supermarket stores, grocery categories and subcategories, and common supermarket brands.

## [1.0.2] - 2026-09-18

### Fixed
- Improved hosted signup diagnostics by mapping duplicate-email and Supabase Auth hook failures to explicit translated errors and logging server-side Supabase signup details.
- Added production-safe diagnostics for protected profile recovery and shopping page RPC failures.
- Added production-safe diagnostics for product and admin page RPC failures and response parsing.
- Fixed Next.js server action modules so initial client action state is exported from a non-server module.
- Fixed hosted idempotency receipt handling by removing ambiguous `mutation_id` references in `begin_mutation`.
- Fixed hosted product search and admin invite responses by qualifying the trigram operator and returning boolean invite ownership for bootstrap rows.

## [1.0.1] - 2026-09-18

### Added
- Added persisted edit and removal controls for offline-created cart items, including translated pending, deletion, conflict, and retry states.
- Added queue tests covering dependency ordering, temporary-to-server ID mapping, and authoritative revision propagation across insert, update, and delete replay.

### Fixed
- Fixed offline cart update and delete replay so dependent changes wait for local inserts, retain strict ordering, reuse mapped server revisions, reject changes behind failed or deleted dependencies, keep the optimistic row attached to the active failure, and make reviewed expired mutations retryable.
- Stabilized the six-page production accessibility scan with a dedicated timeout for parallel desktop and mobile browser runs.

## [1.0.0] - 2026-09-15

### Added
- Added the Portuguese-first Meu Cesto collaborative shopping application with English support.
- Added invite-only authentication, role administration, password recovery, and profile privacy controls.
- Added active carts, planning lists, product catalog, store price history, discounts, barcode lookup, and atomic checkout.
- Added owner-controlled sharing by email and expiring token, private Realtime invalidation, and authorized combined history.
- Added private receipt storage, optional Anthropic and OpenAI extraction proposals, data export, and account deletion retention workflows.
- Added a replay-safe offline mutation queue, static-only PWA caching, accessibility support, and responsive mobile/desktop navigation.
- Added a canonical Supabase schema, synchronized migration, generated database types, security tests, and hosted deployment tooling.
- Added deterministic application version generation, public changelog, release verification, and exact dependency/runtime pins.

### Security
- Added hardened security-definer RPCs, restrictive grants and row-level security, hashed join tokens, idempotent mutations, persistent rate limits, and private receipt access.
- Added strict trusted-origin, environment, external-response, upload, money, and Realtime payload validation.
