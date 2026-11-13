# Hisaab (हिसाब)

Local-first invoicing, foreign remittance tracking, and tax reconciliation software designed for Nepali software engineers, remote contractors, and micro-agencies.

**Live Deployment:** [https://hisaab-np.vercel.app](https://hisaab-np.vercel.app)  
**Source Code:** [https://github.com/qvost/hisaab](https://github.com/qvost/hisaab)

---

## Background & Problem

Nepali tech contractors and digital agencies operate across two fundamentally disconnected financial systems:

1. **Foreign Inflow (Gregorian / AD):** International clients pay in USD, EUR, GBP, or AUD via Wise, Deel, Payoneer, Upwork, or direct SWIFT wires on Gregorian dates.
2. **Statutory Compliance (Bikram Sambat / BS):** Nepal's Inland Revenue Department (IRD) requires all financial bookkeeping, PAN/VAT filings, and annual income declarations in NPR, strictly partitioned by the Bikram Sambat fiscal year (1 Shrawan to 31/32 Ashadh).

Under **Section 95क(6क) of Nepal's Income Tax Act, 2058**, banks withhold an advance/final tax (typically 5%) on foreign currency IT and software service exports. For tax returns and audit clearance, earnings must be converted using the **official Nepal Rastra Bank (NRB) buying rate** on the date funds settle in the Nepali bank account.

International accounting platforms (QuickBooks, Xero, Wave) do not support the Bikram Sambat calendar, NRB exchange rate schedules, or Nepali withholding tax rules. Legacy local software (Tally, Swastik) is built for physical retail inventory rather than remote digital services. Hisaab bridges this gap with zero cloud infrastructure and zero data exposure.

---

## Core Capabilities

### 1. Dual-Calendar Fiscal Engine (`Samayamiiti`)
* Standalone astronomical conversion table covering Bikram Sambat years 2000 BS to 2095 BS (accounting for irregular 29–32 day months).
* Automatically resolves the active Nepali Fiscal Year (`FY 2081/82`, `FY 2080/81`) from transaction dates:
  * Months 04–12 (Shrawan–Chaitra) $\rightarrow$ `YYYY/(YY+1)`
  * Months 01–03 (Baisakh–Ashadh) $\rightarrow$ `(YYYY-1)/YY`
* Tracks statutory filing deadlines: monthly VAT returns (25th of the following BS month), trimester (Chaumashik) dates, and the annual Ashoj income tax filing window.

### 2. NRB Forex & Remittance Ledger
* Integrates with the official Nepal Rastra Bank API (`https://www.nrb.org.np/api/forex/v1/rates`) via a cached proxy route.
* **Weekend & Holiday Walkback:** Automatically walks back to the most recent published business day when transactions settle on Saturdays or gazetted public holidays (Dashain, Tihar, etc.).
* **Currency Unit Normalization:** Automatically handles non-standard currency units (USD/EUR/GBP = 1, JPY = 10, INR = 100).
* **Statutory Calculations:** Computes Gross Statutory NPR (at NRB rate), Net Realized NPR, Section 95क 5% TDS, intermediary wire deductions, and realized foreign exchange gain/loss variance.
* Local document storage for SWIFT Foreign Inward Remittance Certificates (FIRC) and credit advice slips.

### 3. Local-First Architecture & Data Privacy
* **100% Client-Side:** All financial records, clients, invoices, and bank statements are stored in the browser's IndexedDB via **Dexie.js**.
* **Zero Telemetry / Zero Cloud DB:** No external analytics, no user accounts, and no third-party servers storing financial numbers.
* **Encrypted Vault:** Exports and restores complete database snapshots using client-side AES-GCM (PBKDF2 key derivation) into timestamped `.hisaab` backup files.

### 4. PAN/VAT Invoicing Studio
* Builds professional dual-currency, dual-dated (BS & AD) service invoices.
* **0% Zero-Rated Export VAT:** Automatically applies the statutory IT export exemption under Section 7(2) of Nepal's Value Added Tax Act, 2052, with the required legal declaration.
* Pre-configured banking wire instructions (SWIFT/BIC, intermediary banks, account details).
* Direct vector PDF generation via `@react-pdf/renderer` with print-ready layouts.

### 5. Bank Statement Reconciliation
* Parses exported CSV and Excel (`.xlsx`) statements from:
  * **ConnectIPS**
  * **Nabil Bank**
  * **NIC Asia Bank**
  * **Global IME Bank**
  * **eSewa & Khalti**
* Multi-rule fuzzy matching algorithm:
  * Exact Net Deposit match ($\pm 4$ days)
  * TDS-adjusted invoice match (`deposit == gross * 0.95`, $\pm 5$ days)
  * Narration keyword heuristics (`"WISE"`, `"DEEL"`, `"UPWORK"`, `"PAYONEER"`, `"SWIFT"`)
* Split-pane interface to confirm matches, quick-create remittances from deposits, or flag personal/non-business transactions.

### 6. "Ashoj Tax Pack" IRD Exporter
* Prepared specifically for Nepal's annual Ashoj tax deadline.
* Supports both **Individual Freelancer (Section 95क 5% Final Tax)** and **Registered Business (Corporate / Sole Proprietor with 50% IT Export Exemption)** regimes.
* **IRD Portal Cheat-Sheet:** Direct field-by-field values formatted for copy-pasting into IRD electronic forms (D-01 / D-03).
* Exports an audit-ready package: Executive Tax Summary PDF, detailed Remittance Schedule CSV, and attached bank credit advice slips.

---

## Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript 5.x (Strict) |
| **Styling** | Tailwind CSS (Dark-minimalist aesthetic, `#131313` obsidian theme) |
| **Persistence** | Dexie.js v4 (IndexedDB with `useLiveQuery` reactivity) |
| **PDF Rendering** | `@react-pdf/renderer` (Client-side vector generation) |
| **Data Parsing** | PapaParse (CSV) + SheetJS (XLSX) |
| **Icons & Navigation** | Lucide React + `cmdk` (Cmd+K Command Palette) |
| **Cryptography** | Native Web Crypto API (AES-GCM / PBKDF2) |

---

## Project Structure

```
hisaab/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── invoices/           # Invoicing studio & PDF actions
│   │   │   ├── remittances/        # Foreign wires & Section 95क TDS ledger
│   │   │   ├── reconcile/          # Bank statement CSV/Excel parser & matcher
│   │   │   ├── tax-pack/           # Ashoj IRD audit pack generator
│   │   │   ├── settings/           # Profile, bank accounts & encrypted vault
│   │   │   └── page.tsx            # Main overview & fiscal-year metrics
│   │   ├── api/
│   │   │   └── forex/route.ts      # Stateless NRB rate proxy & edge cache
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── dock.tsx                # macOS-style magnifying floating dock
│   │   ├── top-bar.tsx             # Live NST clock, BS date & NRB ticker
│   │   ├── command-palette.tsx     # Cmd+K navigation
│   │   ├── calendar/               # Dual-date picker & BS badge components
│   │   ├── invoices/               # Vector PDF templates & invoice studio
│   │   ├── remittances/            # Remittance drawer & statutory math cards
│   │   └── reconcile/              # Statement uploader & split-pane inspector
│   └── lib/
│       ├── calendar/               # Samayamiiti BS/AD conversion engine & tables
│       ├── db/                     # Dexie schema, indexes, hooks & AES backup
│       ├── forex/                  # NRB API client, fallback walk & calculations
│       ├── parser/                 # Bank statement normalizer & column mapper
│       └── reconcile/              # Fuzzy-matching heuristics engine
├── tests/                          # Standalone verification suites
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Getting Started

### Prerequisites
* Node.js 20+
* npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/qvost/hisaab.git
cd hisaab

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Test Suites

The codebase includes standalone verification suites for core business logic:

```bash
npm run test:calendar     # Verify BS/AD astronomical conversion & leap years
npm run test:db           # Verify Dexie schema, operations & AES-GCM backup
npm run test:forex        # Verify NRB parsing, unit divisors & holiday fallback
npm run test:remittances  # Verify Section 95क 5% TDS and FX variance formulas
npm run test:invoices     # Verify dual-date numbering & invoice snapshots
npm run test:reconcile    # Verify bank statement fuzzy-matching rules
npm run test:tax-pack     # Verify IRD D-01/D-03 aggregation logic
```

### Production Build

```bash
npm run typecheck
npm run build
npm run start
```

---

## Statutory Disclaimer

Hisaab is open-source bookkeeping and tax preparation software. It is designed to assist with record-keeping and reconciliation against official Nepal Rastra Bank and Inland Revenue Department rules. It does not constitute formal legal or certified accounting advice. Always verify final annual tax filings with a licensed Chartered Accountant (CA) or tax professional.

---

## Author

**Siddid Pandey** ([@qvost](https://github.com/qvost))
* LinkedIn: [linkedin.com/in/qvost](https://www.linkedin.com/in/qvost/)
* Email: [qvostwon@gmail.com](mailto:qvostwon@gmail.com)

---

## License

MIT License. Free and open-source for Nepali developers, freelancers, and businesses.
