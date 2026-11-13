# Statement reconciliation

`/reconcile` is a concrete client route with a local statement uploader, status summary, keyboard-navigable statement list, match inspector and reviewed reconciliation actions. All bank records and domain entities are read reactively with Dexie live queries.

## File ingestion

CSV uses Papa Parse with quoted/multiline-field support and no dynamic numeric coercion. XLSX uses SheetJS Community Edition 0.20.3 from its official distribution endpoint (https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). Both are imported only when needed. No statement file or narration is uploaded.

Inputs are limited to 5 MiB and 10,000 statement rows. The mapper offers worksheet and header-row selection, bank/source and account label, explicit AD/BS date format, narration, incoming credit, outgoing debit, and optional reference columns. Recognized headers prefill ConnectIPS, Nabil, NIC Asia and wallet mappings; Global IME uses the same general mapper. Wallet presets use Amount + Type instead of guessing that every amount is incoming. Supported wallet directions are credit/cr/received/receive/incoming/deposit/cash in and debit/dr/sent/send/outgoing/withdrawal/payment/cash out.

Dates accept explicit AD YMD, DMY, MDY or BS YMD; ambiguous day/month ordering is a visible user choice. Excel numeric date cells are decoded with the workbook's date system, not treated as NPR amounts. Amounts support western/Indian grouping, Nepali digits and NPR/Rs./रु prefixes, while rejecting invalid grouping and more than two decimal places. Credit and debit columns cannot both be positive. Credits become positive `amountNPR`; debits become negative. Empty and zero-amount rows are skipped. Invalid rows are shown and block import unless the user explicitly chooses to exclude them.

Each imported record starts unmatched with source account, file, reference and parsed-row provenance. A native SHA-256 fingerprint plus Dexie schema v3's unique `importFingerprint` index prevents duplicate imports, including concurrent imports. Existing schema v1/v2 store definitions remain unchanged. Without a bank reference, an occurrence ordinal preserves repeated identical transactions within a file. A partial overlapping export of otherwise identical unreferenced entries cannot always be distinguished; use consistent source/account labels and review duplicate counts. Renaming the file does not create new transactions.

## Suggestions

`src/lib/parser/fuzzy-matcher.ts` is pure and returns confidence, ranked candidates, a recommended target or null, ambiguity and narration evidence.

1. Exact logged remittance net credit, within four calendar days, with at most one paisa difference: high confidence. Existing matched remittances are unavailable to another bank row.
2. Open foreign invoice total × official settlement-date NRB per-unit buying rate × 0.95, rounded to paisa, within five days of issue date: high confidence. Bundled benchmarks never produce a high-confidence amount match. Domestic NPR invoice exact amounts are also recognized.
3. Client/source word overlap, compact names and a bounded one-character fuzzy comparison: medium confidence. WISE, PAYONEER, DEEL, UPWORK, STRIPE and SWIFT identify potential foreign deposits, but a generic platform keyword alone never chooses an unrelated invoice.

An exact remittance takes precedence over invoice estimates. Equal candidates at the highest rule priority require explicit selection. Outgoing, ignored and already-matched entries are not proposed as new income matches. The inspector shows amounts, date difference, source entity and keyword evidence. The five-day invoice window intentionally uses the issue date; later legitimate payments can be linked manually.

NRB lookup runs for the selected row's potentially relevant invoice currencies. Failures leave manual and remittance-based matching available. Results are keyed by settlement date and stale requests cannot replace a newer selection's rates.

## Atomic actions and payment status

Confirming updates bank links, confirmation provenance and invoice status in one transaction. A full invoice amount match marks the invoice paid. For linked remittances, reconciled foreign amounts are summed against invoice face value; partial receipts remain partially paid. A manual invoice link without full-payment confirmation also stays partially paid, unless the invoice was already paid. Exact-net links to a logged remittance reject a different credited amount.

Quick-Create Remittance fills the logger's bank credit, bank/source, date, reference and narration; foreign amount/currency remain reviewable. Saving creates the remittance and links the originating bank row inside the same transaction. The bank row must still be unmatched; the amount must match and dates must be within four days. A conflict or failed file/record write leaves neither an orphaned receipt nor a partial link.

Mark as Personal / Non-Business changes only the bank row to ignored. It creates no invoice, remittance or tax revenue. Unmatch resets links. The first reconciliation stores the invoice's prior status as a baseline; remaining matches determine paid/partially-paid status, and removing the last match restores that baseline. Explicit later “Mark paid” actions update the baseline so unmatching does not erase a manual payment decision. Legacy matches without a recorded baseline preserve existing invoice status when reset.

Backup validation preserves fingerprints, statement provenance, reconciliation metadata and invoice baseline status, validates linked entities and rejects duplicate fingerprints. The JSON payload remains v2 with additive optional fields; the database moves to v3 for its new index.

## Interaction

Up/Down selects and focuses statement rows; Enter confirms a selected candidate; I marks an unmatched row ignored. Inputs, dialogs, the command palette and non-row buttons retain their normal keyboard behavior. Confirmation uses a restrained green visual pulse with reduced-motion support and an accessible status message. No sound is played automatically.

All imported rows are shown across accounts, with All / Unmatched Only / Matched / Ignored filters. Unmatched Credits in the summary counts only positive unmatched deposits. The Unmatched Only list also includes outgoing rows for explicit review.

## Verification

`npm run test:reconcile` strictly type-checks the pure parser/matcher/backup modules and runs nine behavioral tests for presets, wallet direction, AD/BS dates, NPR parsing, import identity, match bounds, official-vs-bundled quotes, fuzzy signals, ambiguous matches and metadata backups. Earlier pure suites also pass (34 tests total).

`npm run test:statement-files` uses real Papa Parse and SheetJS to read CSV quoting/newlines and real XLSX workbooks/dates. `npm run test:db-integration` now includes repeated/concurrent imports, matched links, invoice status rollback, ignored states, backup restoration, atomic quick-create and duplicate-save rejection.

The current environment still cannot resolve npm hosts (`EAI_AGAIN`). The required parser and Dexie packages are unavailable, so real-file/integration tests, full build/type checking and browser verification remain blocked. No successful CSV/XLSX runtime or UI animation check is claimed. With registry access, run `npm install` to install dependencies and refresh the lockfile, then the commands above plus `npm run typecheck`, `npm run build` and `npm run dev`.
