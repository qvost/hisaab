# NRB forex

## Proxy

`GET /api/forex?date=YYYY-MM-DD` is an Edge route with a fixed NRB upstream. It forwards only validated dates using `page=1&per_page=1&from=date&to=date`; the response is `{ date, publishedOn, rates }`. Each keyed rate contains NRB's raw buy/sell, quoted unit and `effectiveBuy = buy / unit`. All returned ISO currencies are retained. Validation rejects impossible dates, repeated/missing dates and future dates using NST. There is no user data, authentication, database or server persistence in the proxy.

Documentation: https://www.nrb.org.np/api-docs-v1/

Nonempty valid publications receive `public, s-maxage=86400, stale-while-revalidate=604800`. Empty successful days return `rates: {}` and an empty `publishedOn`, with `no-store` so a request before daily publication cannot freeze an empty result. Bad inputs return 400, upstream/schema failures 502, and timeouts 504 (8 seconds), all with `no-store`. The same-origin proxy avoids browser-to-NRB CORS restrictions without opening an arbitrary upstream proxy.

## Browser lookup

`getNrbForexRate(dateAD, currency = 'USD')` returns `{ rate, isFallback, fallbackDate?, source, benchmarkPeriod? }`. The rate is always NPR per one currency unit. An IndexedDB cache hit requires no network request (IndexedDB itself is asynchronous, not literally zero milliseconds).

For a cache miss, the lookup requests the same-origin proxy if online, then checks each previous civil date through five days prior. Only actual nonempty publications are cached. Each cache key remains the requested publication day rather than creating permanent holiday aliases. This lets tomorrow's query find a newer publication. `fallbackDate` identifies the earlier daily publication; its cause is not guessed. An API failure switches to saved data / benchmarks rather than labeling the failure a holiday. Unsupported currencies in a valid publication produce an error instead of silently selecting an older quote.

Today's cached publication is revalidated hourly online and retained if that revalidation fails. Prior-day cache entries are reusable offline. Simultaneous requests for a date share an in-flight network request. Storage denial/quota errors do not discard a valid network quote. No empty response is persisted. Future/invalid dates fail before cache or network work.

## Offline benchmarks

`historical-rates.json` bundles NRB-reported mid-July 2023 and 2024 opening benchmarks for FY 2080/81 and 2081/82. USD, EUR, GBP, JPY and the fixed INR quote are included. Source: NRB Annual Report 2023/24, Table 1.4 and its discussion of the fixed INR rate:
https://www.nrb.org.np/contents/uploads/2025/07/Annual-Report-2023-24-English.pdf

These are fiscal-year benchmarks, not a complete daily historical archive. A benchmark result has `source: 'bundled'`, `isFallback: true`, and a named `benchmarkPeriod`; it has no invented daily `fallbackDate`. It is never written into the official publication cache. The badge labels it “benchmark” and asks for settlement-date verification before filing. Uncovered years/currencies with no cache/API quote throw `ForexRateUnavailableError`; the current ticker never passes off a 2024 benchmark as today's rate.

## Calculations

`calculateRemittanceStatutoryFigures` validates positive foreign amount/rate and finite nonnegative credit, withheld TDS and fees. It computes:

- Statutory gross: foreign amount × per-unit NRB buying rate, to paisa precision.
- Expected 5% TDS: `Math.round(statutoryGrossNPR * .05)` in whole rupees, as requested.
- Bank realized rate: actual net credit ÷ foreign amount.
- FX variance: actual credit + actual withheld TDS + intermediary fees − statutory gross, to paisa precision. This separates currency movement from tax and fees.
- TDS discrepancy: recorded withholding differs from the expected whole-rupee amount. When withholding is omitted, calculations assume the expected amount and do not claim a discrepancy.

The database remittance helper delegates here and accepts optional actual withholding. The helper applies the supplied 5% model; it does not determine taxpayer eligibility or prove a bundled benchmark is the legally effective settlement-date rate.

## UI and verification

`ForexRateBadge` optionally accepts `dateAD` and `currency`. With no date it follows the NST day, polls once per minute and refreshes on reconnect. It shows loading/unavailable states and a green check/dot only after a local cache row is observed. Keyboard focus or hover reveals publication provenance. It replaces the header's fixed sample quote.

`npm run test:forex` strictly type-checks the pure engine and proxy, then tests normalization, units, request validation/cache headers, empty-vs-error behavior, cache hits, walkback bounds, offline coverage, storage failure, request deduplication and calculations. Network and cache boundaries use deterministic adapters; these tests do not assert live NRB availability. The existing database and calendar suites also remain applicable. Dexie/browser integration is still blocked in this environment by missing dependencies and network access; live NRB API retrieval could not be performed here.
