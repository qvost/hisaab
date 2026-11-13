# Samayamiiti

The pure engine has no runtime dependencies. Supported BS years: 2000–2095 inclusive. All months are one-based. Invalid dates and unsupported ranges throw `RangeError`; dates never silently roll over. A fiscal range must fit wholly in the supported table (full fiscal years 2000/01 through 2094/95).

## Civil dates and instants

Use `YYYY-MM-DD` strings for invoice and settlement civil dates. A JavaScript `Date` or an ISO timestamp with an explicit offset is an instant: conversion uses its calendar day in Asia/Kathmandu (UTC+05:45). Offset-free timestamps are rejected. `bsToAd` returns midnight UTC on the corresponding Gregorian day; use `.toISOString().slice(0,10)` to persist that civil date. Fiscal range ends are inclusive date boundaries, not the last millisecond of a day.

`adToBs().formatted` is BS YYYY-MM-DD; `formattedNp` uses Nepali month names and digits. `formatNepaliDate` accepts an optional fourth argument `'np'` (default `'en'`).

## Data provenance and accuracy

Month-length facts are transcribed from https://github.com/nativeTiger/nepali-date-utils/blob/main/src/calendar-data.ts (accessed 2026-11-13). Source anchor: BS 2000-01-01 = AD 1943-04-14. The source explicitly labels years beyond about 2085 as projections; the exported `PROJECTED_FROM_BS_YEAR` conservatively flags 2085 onward. Future official calendars may change those month lengths. This is a lookup-based civil calendar engine, not an astronomical ephemeris calculation. Exhaustive round trips prove internal consistency, not independent official accuracy of every table entry.

Monthly VAT deadlines follow the requested next-month day 25 rule, supported by IRD's SOP: https://ird.gov.np/public/pdf/1112838743.pdf. This helper does not apply administrative extensions or special filing periods.

## UI

`useNepaliCalendar()` returns `null` before client hydration, then `{ currentAD, dateAD, currentBS, fiscalYear, nstClock }`, updating each second with cleanup on unmount. The header uses it without changing the dashboard's historical demo accounting period.

`DualDatePicker` is controlled by `valueAD`; `onChange` receives `{ ad: 'YYYY-MM-DD', bs: BsDate, fiscalYear }`. Supply a valid in-range initial value. AD uses the browser's native date input; BS supports typed ISO dates and a month grid. Invalid drafts show inline feedback without emitting a new selection. Escape and outside-pointer clicks dismiss the popover. The overview mounts an interactive preview.

Run `npm run test:calendar` for independent anchors, all 35,065 supported days, fiscal boundaries, VAT rollover, invalid inputs, and NST midnight transitions. Run under different host TZ values to check timezone independence.
