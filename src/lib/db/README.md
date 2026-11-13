# Local persistence

`hisaab_db` is a lazy-opening browser IndexedDB database with the eight requested stores at schema version 3. There are no network, auth, or server storage calls. Add future indexes or migrations via a new `version(n).stores(...).upgrade(...)`; never change the meaning of an already-shipped version.

## Write records

Use `createInvoice`, `createRemittance`, and `createExpense` from `records.ts`. Callers supply AD dates; these helpers derive BS dates and fiscal years, invoice line totals and VAT, and remittance gross/TDS/variance. IDs and creation timestamps are generated. Export invoices use 0% VAT and domestic invoices 13%. The remittance helper implements the requested 5% withholding calculation; it does not determine eligibility for a tax regime.

Dexie creating/updating hooks also regenerate date fields, including on direct `add`, `put`, `bulkAdd`, and date updates. Modifying an AD date therefore moves the record into its matching fiscal period. The typed tables remain available for later workflows; callers of direct table writes must supply financially consistent records and valid references. Those relationships are checked again at backup boundaries.

Monetary amounts are numeric currency units, rounded to two decimal places. Aggregation sums integer minor units. Rates retain precision. Gross realized value is `actualCreditedNPR + tdsWithheldNPR + intermediaryFeeNPR`; bank realized rate is actual net credit / foreign amount, and realized FX variance is gross realized minus statutory NRB gross. Fees and withheld tax are not mislabeled as FX losses.

## Read reactive state

All UI reads use the hooks in `hooks.ts`, backed by `useLiveQuery`. `undefined` means loading. `useSettings` returns a fresh default profile after the query completes if none is saved. Query failures propagate to a React error boundary; the overview includes one with recovery guidance.

`useFiscalYearStats` reads invoices and remittances in a single readonly transaction. Issued invoices include sent, overdue, partially paid and paid; drafts and cancelled invoices are excluded from invoiced totals and unpaid counts. USD totals never combine EUR/NPR amounts. Remittance totals reflect settlement fiscal years, independently of invoice issue years. The selector defaults to historical FY 2081/82 so the requested samples appear immediately.

`seedDemoData` checks every store and writes all sample records in one read/write transaction. It returns false for a nonempty financial ledger; existing settings and forex cache are allowed, and a saved profile is preserved; concurrent invocations cannot duplicate records. The sample PAN, account numbers and NRB rates are fixtures, not credentials or live financial quotes.

## Schema version 2

Forex cache rows now contain the normalized NRB currency map, quoted units, per-unit effective buys and publication date. Upgrading from v1 clears only the rebuildable forex cache and changes stored bank realized rates to `actualCreditedNPR / foreignAmount`, preserving amounts, dates and TDS. Backups now export payload version 2. Version 1 imports preserve financial records, migrate bank rates and discard unitless quotes. The binary encryption envelope remains v1 independently of the payload schema.

## Encrypted backups

`exportEncryptedBackup(password)` returns a `File` (a `Blob` subclass) with a timestamped `.hisaab` name. Download using an object URL and its `.name` when the result is a `File`, then revoke the URL. No password or derived key is persisted.

The binary v1 envelope is `HISAAB01` + 16 random salt bytes + 12 random IV bytes + authenticated ciphertext. Native Web Crypto derives a nonextractable AES-256-GCM key using PBKDF2-HMAC-SHA-256 with 600,000 iterations. All header bytes are authenticated. Every export gets a fresh salt and IV. The format fixes its algorithm/iteration choices; changing them requires a new envelope version. Backups are capped at 50 MiB including header and tag. Web Crypto requires a secure context (HTTPS or localhost).

All eight stores are snapshotted in one readonly transaction. Documents use base64 contents so JSON round trips preserve binary bytes. Import decrypts and validates format/version, fields, enums, safe integer IDs, duplicate IDs, calendar alignment, financial totals and references before opening a write transaction. Restore replaces all eight stores atomically and preserves IDs. Any write failure rolls back the clears. UI callers must explain replacement semantics before invoking restore. Exported files contain the full financial profile and document contents, encrypted with the supplied password; the live IndexedDB database itself is not encrypted by this feature.

## Verification

- `npm run test:db`: real Web Crypto round trips, randomized ciphertext, wrong passwords, tampering, field/date/reference validation, monetary totals, and financial status/currency behavior. This suite also strictly type-checks its pure TypeScript modules before emitting them.
- `npm run test:db-integration`: actual Dexie with `fake-indexeddb`, exercising concurrent/idempotent seeding, reactive invalidation, calendar maintenance, backup replacement, wrong-password nonmutation, and rollback.
- `npm run typecheck` and `npm run build`: full application checks.

The authoring environment currently cannot resolve npm hosts and has no cached Dexie/fake-indexeddb packages. The pure database suite and calendar suite pass; full application and IndexedDB integration verification remain blocked by those missing dependencies. Run `npm install` with registry access to install dependencies and refresh `package-lock.json`, then run the checks above. Browser layout/interactions still require browser QA.

## Schema version 3

Bank rows gain an optional unique import fingerprint index for repeat-safe statement ingestion. Source codes now include ConnectIPS, Global IME and Khalti. Statement/confirmation provenance and invoice reconciliation baseline statuses are optional fields and remain compatible with earlier JSON payloads. See the reconciliation module for matching and unmatch semantics.

## Settings and annual preparation

Profile bank accounts can record an optional NPR/FCY type. Expense rows can contain a reviewed deductible NPR assessment and rationale; both fields survive backups. `createBackupPayload` is the shared all-store snapshot used for raw and encrypted exports. Settings and tax-pack workflows are documented in their respective modules.
