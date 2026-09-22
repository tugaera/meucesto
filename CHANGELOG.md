# Changelog

## [1.0.9] - 2026-09-22

### Fixed
- Fixed create-product-and-add-to-cart by disambiguating cart item RPC parameters from table columns.
- Kept product detail modal edits stable while submitting, closed the modal after successful add, and cleared the cart form only after the item is actually added.
- Added server-side diagnostics for shopping mutations so hosted RPC failures include the failing function and database details in logs.

## [1.0.8] - 2026-09-22

### Fixed
- Fixed shopping list item add, edit, and remove RPCs by disambiguating list and item parameters from table columns in Supabase functions.
- Added server-side diagnostics for list mutations so hosted RPC failures include the failing function and database details in logs.

## [1.0.7] - 2026-09-22

### Added
- Added camera barcode scanning and barcode lookup to shopping lists so scanned products can populate list item names.

### Fixed
- Improved list item adding feedback by showing pending state, resetting the form after success, and rotating mutation IDs between successful submissions.

## [1.0.6] - 2026-09-19

### Added
- Added in-scanner settings for fast or precise barcode reading, browser-native detection, and high-resolution camera capture, with preferences saved per browser.

### Fixed
- Improved real-package barcode recognition by running supported browser-native barcode detection alongside the ZXing fallback in precise mode.

## [1.0.5] - 2026-09-19

### Fixed
- Fixed camera scanning on desktop and Android by avoiding ZXing's broken `TRY_HARDER` canvas rotation path while retaining focused high-resolution EAN and UPC recognition.

## [1.0.4] - 2026-09-19

### Fixed
- Improved camera barcode recognition with retail format prioritization, harder scanning, higher-resolution rear-camera capture, continuous focus when supported, optional flashlight control, visible scanning guidance, translated camera errors, and reliable stream cleanup.

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
