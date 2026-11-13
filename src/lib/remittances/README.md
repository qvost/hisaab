# Foreign remittance ledger

`/remittances` is a concrete route; the generic placeholder route no longer generates it. It shares the existing obsidian shell, status bar and dock.

## Read and review

The fiscal-year selector uses the Samayamiiti range resolver. Summary cards and rows use Dexie live queries. The initial period is FY 2081/82 so the existing sample remittances appear immediately; users can select any full supported fiscal year. Search filters the visible table by source, bank, reference, narration and currency. Summary cards and exports always describe the entire selected fiscal year, regardless of the search text.

Foreign inflows are grouped by currency and never added as unlike money. The other four cards sum stored statutory gross, actual TDS, actual bank credits and realized FX variance. Legacy/sample and manual-rate records remain visible with provenance review labels. This screen does not imply that a historical sample quote is an official settlement-date quote.

A source button or row click opens the audit drawer with the full calculation, rate provenance, narration, transfer reference, creation timestamp and saved credit advice. The paperclip opens that same drawer. TDS badges compare recorded withholding against the requested 5% model; they do not authenticate an IRD tax credit or determine tax-regime eligibility.

## Log and edit

`N` opens the form when focus is outside text inputs, buttons and existing dialogs. The header button is the equivalent touch/keyboard control. Native modal dialogs provide focus containment; Escape or the close control dismisses them. An open dual-date picker consumes Escape first. Save and delete operations disable dismissal until they finish. Reduced-motion settings suppress the entry/exit animations.

Settlement date and currency trigger the NRB client. Stale requests cannot overwrite a quote for a newer selection. Official API/cache results retain the requested and publication dates. A bundled benchmark cannot be saved automatically as “NRB Verified”: users must explicitly override with a reason. Manual edits require a reason. Editing an existing record initially preserves its recorded rate and provenance; changing the date, currency or rate requires new evidence. The form shows estimated withholding until the user edits it, and offers a reset to the expected 5%. NRB failures offer a retry or manual entry.

Optional invoice links must exist and use the same currency. Standalone platform transfers use `invoiceId: null`, rather than creating a fictitious invoice. Source, bank narration, SWIFT reference, document ID, rate evidence and modification time live in the optional `audit` record. Its absence means legacy/unverified provenance. These additive fields require no index migration; old backups remain readable. AUD is now supported alongside USD/EUR/GBP in the database and backup validator.

`saveRemittance` computes totals with the shared statutory calculator and resolves BS/fiscal dates. It saves documents and records atomically. Edits preserve creation timestamps and replace or remove unshared advice records within that transaction. Edits or deletion of reconciled remittances are rejected until their bank transaction is unmatched, preserving reconciliation links. Invoice status is not automatically changed by logging or deleting a transfer.

## Credit advice

PDF, PNG, JPEG and WebP files up to 8 MiB are accepted from the file picker or drag/drop. File signatures are checked before base64 encoding. File work finishes before the IndexedDB transaction opens. No document is uploaded. Preview object URLs are revoked when the drawer unmounts; downloaded object URLs are revoked after use. PDF preview is sandboxed, with a download alternative for browsers that block inline PDFs. SVG and arbitrary HTML are excluded from inline document previews.

Backup validation includes attachment references, standalone remittances and rate-evidence fields; encrypted backups preserve them with the rest of the financial data.

## Export

“Export Remittance Schedule (CSV)” downloads every record in the selected fiscal year in settlement-date order. It includes all 12 requested columns followed by `Rate_Provenance`, `NRB_Published_On` and `Override_Reason`, so an override cannot masquerade as an official quote. The download uses UTF-8 BOM, CRLF line endings, escaped quoted fields and spreadsheet-formula neutralization for user-entered text. Signed numeric values stay numeric. Exports are a reviewable schedule, not an automated filing to IRD.

## Verification

`npm run test:remittances` strictly type-checks the pure ledger modules and exercises currency-separated summaries, TDS calculations, fiscal options, CSV serialization/escaping, actual binary attachment round trips, input rejection, standalone records and audit metadata backup validation. The database integration suite also includes save/edit/year moves, advice replacement, reconciliation guards and deletion cleanup.

All available pure suites pass. Dependency installation was retried and fails with npm DNS `EAI_AGAIN` in this environment. Dexie and fake-indexeddb are still unavailable, blocking full app type/build checks, the integration suite and runtime browser verification. After installing dependencies with registry access, run:

```sh
npm install
npm run typecheck
npm run test:remittances
npm run test:db-integration
npm run build
npm run dev
```

Browser acceptance checks: select a fiscal year, log with N, test an official/fallback/manual rate, change date and currency during fetch, edit TDS, drop an advice file, save and observe totals, open/edit/delete a row, export CSV, check mobile horizontal scrolling, and verify Escape/focus restoration and reduced motion.
