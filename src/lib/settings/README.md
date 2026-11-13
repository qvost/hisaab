# Settings and local vault

`/settings` combines a typed profile editor, bank account management and backup/database controls. Profile reads and row counts are reactive. All operations use the existing browser `hisaab_db`; there is no auth or server database.

The profile stores business/freelancer name, owner, nine-digit PAN, registered address and the existing individual / sole-proprietor / Pvt Ltd tax modes. PAN entry accepts Nepali digits and normalizes them to ASCII. Accounts retain leading-zero account numbers as text, beneficiary, bank, SWIFT/BIC, branch, intermediary routing notes and NPR/FCY type. FCY accounts require SWIFT/BIC. The first account pre-fills new invoice instructions; issued invoice snapshots do not change when settings are edited. Saving a profile normalizes and validates it before writing the single `profile` record.

## Privacy and backup semantics

The badge states “Zero Cloud Database • Local financial privacy”. Records live in IndexedDB. It intentionally does not claim that the live database is encrypted or guarantee absolute privacy on a shared device. AES-GCM protects exported backups only, using the existing PBKDF2/native Web Crypto format.

- Encrypted export prompts for a password and repeat, snapshots every table and attachment, and downloads a timestamped `.hisaab` file. Passwords are held in component memory, cleared after success/unmount and never written by Hisaab to storage.
- Restore accepts a .hisaab file and password and explicitly confirms replacement semantics. The existing decrypt/schema checks finish before a single all-store replacement transaction begins. Wrong password, corruption or validation failure leaves records unchanged.
- Raw JSON backup downloads the same validated, full snapshot without encryption. The UI identifies that it includes PAN/bank data and attachment contents. Raw JSON is for inspection/portability; the restore control expects an encrypted .hisaab file.
- Sample data seeding requires an empty financial ledger (clients, invoices, remittances, statements, expenses, documents). Existing profile and forex cache do not block it; an existing real profile is preserved. Repeated/concurrent calls do not duplicate fixtures.
- Reset requires the exact phrase `RESET ALL DATA` in both UI and repository validation. It clears all eight stores in one transaction while retaining the open database connection, allowing live queries to refresh safely. It does not silently seed again. A live NRB reference lookup can subsequently cache a new public quote.

The editor refreshes to a restored/saved profile. Backup, restore and reset use native modal dialogs with focus containment and Escape/close handling; destructive operations cannot be dismissed while a transaction is pending. UI status messages report actual completion or errors, not optimistic success.

## Checks and current limits

`npm run test:tax-pack` includes profile normalization, FCY/NPR preservation, invalid profile rejection, strict reset confirmation and backup schema round trips. The actual Dexie suite (`npm run test:db-integration`) adds cache/profile-aware seeding, raw snapshots, wrong-password behavior, full reset and restore. Native crypto tests (`npm run test:db`) pass.

The environment cannot install required packages because npm DNS access fails. Full application checks, Dexie integration and browser verification remain blocked. With network access, run `npm install` (also refreshes the lockfile), `npm run typecheck`, `npm run test:db-integration`, `npm run test:invoice-pdf`, and `npm run build`, then use `npm run dev` to verify both dock links and the interactive flows.
