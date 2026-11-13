# Invoicing studio

`/invoices` is the reactive dashboard; `/invoices/new` creates an invoice and `/invoices/new?draft=ID` edits a saved draft. The generic placeholder route no longer generates `/invoices`.

## Accounting model

`calculateInvoice` is shared by the studio, database creation helper and tests. It rounds each line to minor units before summing, supports export zero-rating, domestic PAN (no VAT) and domestic VAT (13%), and rejects invalid quantities, prices and descriptions. The export declaration is the exact text requested in the brief. Choosing export treatment is a user's classification of the supply, not an eligibility determination by Hisaab. Legislative reference: Section 7(2) and Schedule 2 of the VAT Act, available via https://en.ican.org.np/_browsable/file/career/23Value-Added-Tax-Act-2052.pdf.

Existing `isExport` and `vatRate` fields remain readable. New invoices contain an optional `document` snapshot with treatment, seller/PAN/address, client billing details, bank instructions and issue-date NRB reference. No index change is needed for these additive fields. Backups validate and preserve snapshots, optional client PANs, seller addresses, and bank branch/routing notes. Legacy invoices are clearly labeled when previewing with current profile details.

Invoice NPR equivalents use available official issue-date buying references, with missing-reference counts. Offline benchmarks do not contribute to that equivalent. These are invoice references; statutory settlement-date revenue remains in the remittance ledger. Paid metrics represent invoices marked paid, independently of bank credits. Pending metrics use full face values of unpaid/partially paid invoices, not a calculated remaining balance.

## Save and workflow

Auto numbers use `INV-FY-SEQUENCE`; allocation scans the maximum matching suffix inside the same read/write transaction as saving, preventing races between tabs. Editable custom numbers are checked for collisions. A saved auto number can differ from its live preview if another invoice was saved in the meantime. Issue date determines fiscal year; due dates must not precede issue dates.

Saves require an existing client, valid line items and a seller name/PAN. Issuing additionally requires billing/seller addresses and bank wire details. Future issues can be stored as drafts. Only drafts can be edited. Duplicating copies service and billing details into a new draft, assigns a new number, moves issue/due dates to today/today+30 and clears the previous date's NRB reference. Issued snapshots are preserved when marking paid or cancelled.

Delete and cancellation actions reject linked remittances/reconciliation records. Deleting requires confirmation. Marking paid offers “Record Remittance & NRB Forex” with client, currency, amount and invoice link pre-filled. NPR invoices do not open a foreign-remittance workflow. Paid status is not evidence that a bank settlement or TDS was independently verified, and the logger remains editable for partial transfers.

## Studio and document

The left form supports client creation, dual-calendar issue/due pickers, line add/remove/reorder, tax treatment, seller details and prefilled wire instructions. The right pane is a white A4 paper preview in a dark workspace. Live rates are fetched for the issue date/currency; asynchronous results cannot overwrite a newer date's reference. `N` opens the studio from the list; Cmd/Ctrl+Enter saves a draft and Escape returns to the current fiscal period. These shortcuts defer to client dialogs, the command palette and open date pickers.

`invoice-pdf.tsx` uses dynamically imported `@react-pdf/renderer` primitives for an actual client-generated vector PDF with selectable text, A4 page wrapping, invoice/status metadata, dual issue/due dates, totals, wire details, export declaration and authorized-signatory line. JetBrains Mono is bundled locally for dates/figures with its OFL license; body text uses the PDF standard Helvetica family. This font setup targets Latin-script billing text and numeric BS dates; complex-script billing names need an appropriate additional PDF font and verification. No invoice data is sent to a PDF server. The paper preview is HTML, while the PDF has its own print layout, so they are not a pixel-identical raster capture.

“Open Print Preview” opens the generated PDF in a new tab, where the browser's PDF viewer provides printing. “Download PDF” downloads the same vector format directly. Pop-up failures and render errors remain visible. Downloads use safe filenames; preview/download object URLs are revoked. The PDF renderer is loaded only on demand.

## Checks

- `npm run test:invoices`: strict type checks for pure model/backup modules and behavior tests for VAT/PAN/export totals, number sequences, fiscal boundaries, summaries, notices and snapshot round trips.
- `npm run test:db-integration`: actual Dexie tests also cover concurrent invoice numbering, immutable issued records, duplication, status updates, backup snapshots and linked-delete protection.
- `npm run test:invoice-pdf`: renders the actual component into `artifacts/invoice-sample.pdf` and a multipage fixture after dependencies are available. Inspect these with a PDF viewer or `pdftoppm`/`pdftotext` for layout, page boundaries and selectable content.
- `npm run typecheck`, `npm run build`: full application checks.

All 25 available pure tests pass, including the earlier calendar, forex, remittance and backup suites. The authoring environment still has npm DNS failures (`EAI_AGAIN`); Dexie and the new PDF renderer cannot be installed here. Full build/type checking, IndexedDB integration, PDF rendering and browser QA remain blocked. The PDF fixture runner detects the missing package and does not claim to have rendered artifacts.
