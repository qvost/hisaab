# Ashoj tax pack

`/tax-pack` is a reactive fiscal-year preparation dashboard. It reads the taxpayer profile, settlement-year remittances/expenses, invoice/client references, statement links and document IDs in one readonly transaction. Documents are checked by primary key, without loading all attachment bodies into the dashboard.

## Totals and assessment

Foreign inflows remain separated by currency. The five core figures are recorded statutory NRB gross, bank withholding, net cash credit and gross realized FX variance, plus original-currency inflow. NPR-denominated remittances are excluded from foreign inflow. Actual receipts are filtered by settlement fiscal year even if the linked invoice was issued in another fiscal year. Expected 5% withholding sums the existing whole-rupee per-settlement calculation rather than applying a new annual rounding policy.

The individual mode is a requested 5% final-tax preparation model, not an eligibility ruling. Registered mode allows adding expenses and reviewing a deductible NPR cost basis/rationale. Foreign expense amounts are never silently summed as NPR. Unreviewed expenses remain excluded from the deduction estimate and visible as review items. Zero can record non-deductible expenditure. Hardware and partial business use may require assessment/depreciation.

The displayed net-income estimate is `statutory gross + realized FX variance − reviewed deductions`, preserving negative results. It is not a full return computation: other income, disallowances, loss rules, progressive/corporate rates and IT export relief still require assessment. No automatic 50% reduction of income or tax is made.

## Filing guide and readiness

The cheat-sheet offers copy buttons for plain NPR numbers (without grouping or currency symbols), with a manual-copy fallback. Descriptive labels follow the requested foreign export income, bank TDS and FX gain/loss concepts. They are not invented electronic form IDs. IRD describes D-01 as a presumptive-taxpayer return; D-01 and D-03 are not interchangeable. The UI links the official portal and instructions:

- https://www.ird.gov.np/public/pdf/453697156.pdf
- https://ird.gov.np/faq/?gid=98
- https://ird.gov.np/faq/?gid=97
- https://taxpayer.ird.gov.np/

Ashoj month-end is derived from the selected fiscal year and actual BS month length; it is shown as a reference, with filing eligibility/extensions requiring verification. The dashboard and PDF identify missing profile details, unverified/manual NRB provenance, absent advice, unmatched bank credits, withholding variances and (in business mode) unreviewed expenses. A missing complete taxpayer name/PAN/address blocks export. Other review issues label the output a review draft. Stored withholding is not represented as independently verified IRD/e-TDS credit.

## One-click package

`exportAnnualTaxPack` reads a fresh, consistent snapshot, renders a client-side vector Executive Tax Summary PDF and creates one `.zip` download containing:

- `Executive-Tax-Summary.pdf`: taxpayer PAN/identity, dual fiscal dates, reference Ashoj end, mode, totals, issues and per-settlement NRB schedule.
- `Remittance-Schedule.csv`: linked invoice number, client/source, AD/BS settlement date, foreign amount/currency, NRB rate/gross, bank credit, TDS, FX, SWIFT reference, rate provenance/publication and matching statement date/advice ID.
- `Expense-Review-Schedule.csv` in business mode.
- `Preparation-Notes.json` with period, mode and review items.

CSV uses UTF-8 BOM, quoted fields, CRLF and formula-neutralized text. ZIP uses stored entries with CRC32 and UTF-8 names, implemented without another compression package. The PDF shares the installed `@react-pdf/renderer` and local JetBrains Mono font approach from invoices; it is not a raster screenshot. Renderer/glyph limitations described by the invoice module also apply. The ZIP is an unencrypted export; .hisaab vault backups are separately encrypted. Advice contents remain in the full vault backup; the requested annual package contains advice references, not all attachment binaries.

## Verification

`npm run test:tax-pack` strictly type-checks the pure modules and runs eight tests for settlement-year totals, BS deadlines, reviewed expenses, evidence issues, CSV references/injection handling, profile/reset validation, backup preservation, ZIP structure/CRC and all six concrete dock routes. All 42 available pure tests pass. Python's independent `zipfile` reader also verified ZIP CRCs, UTF-8 entry names and contents on the format fixture.

`npm run test:invoice-pdf` now renders invoice fixtures and `artifacts/tax-summary-sample.pdf` once the renderer is installed. The Dexie integration suite covers expense reviews, raw/encrypted backups, strict resets and restoring profile/account metadata. These are not claimed to pass in the current environment: npm still fails with DNS `EAI_AGAIN`, leaving renderer/Dexie packages unavailable. Full app type/build checks, PDF rendering, live vault operations and browser clicking/animation remain blocked. Source-level route verification confirms all dock destinations have concrete pages; it does not substitute for browser navigation QA.
