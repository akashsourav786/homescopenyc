# Stage 7 — Property Insights

## 1. Stage
**Stage 7 — Property Insights** (`/property-insights`): look up any NYC address for public-record property details and recent sales, plus a compare mode (two addresses side-by-side). This also fulfills the homepage "Compare Homes" row, which now deep-links to `/property-insights?mode=compare`. Both homepage rows flipped to "Live".

## 2. Objective
Give buyers/sellers instant, source-cited property intelligence from official NYC public datasets — no invented data, no fake valuations — with graceful handling of every failure mode (bad address, missing records, API outages).

## 3. Implementation
- **`lib/property-data/`** — new data module:
  - `types.ts`: `PropertyProfile`, `SaleRecord`, `PropertyInsight`, `LookupStatus`, `CompareStat`.
  - `normalize.ts`: pure functions — `normalizeBbl` (handles PLUTO's float-formatted `"1008350041.00000000"`), `parseApiNumber`, `boroughName` (PLUTO `MN` + DOF `1` codes), `landUseLabel`, `normalizePlutoRecord`, `normalizeSaleRecord`, `formatMoney`/`formatCount`/`formatDate` (UTC), `compareStats`, `toInsight`.
  - `client.ts`: `geocodeAddress`, `getPropertyProfile`, `getSaleHistory`, `lookupProperty` — all `fetch`-based with 12s timeout (AbortController), typed `PropertyDataError` codes (`not-found` / `no-pluto` / `timeout` / `http` / `network` / `parse`). Sales: newest-first, `$0` transfers excluded, capped at 5.
- **`components/property-insights/property-insights.tsx`** — UI shell: Single/Compare mode tabs, address form(s), loading skeletons, `InsightCard` (header, 8-fact grid, assessed value + zoning chips, last sale, sale history), `CompareTable` (7 stats with higher/newer/tie badges), Contact Akash CTA under results, always-visible NYC Open Data disclaimer, assumptions & sources panel.
- **`app/property-insights/page.tsx`** — thin shell with metadata + `Suspense` (for `?mode=compare`).
- **`lib/nav.ts`** — "Property Insights" and "Compare Homes" rows → `"Live"`; Compare Homes links to `/property-insights?mode=compare`.
- **Verified live endpoints (2026-10-10):**
  - Geocoding: `https://geosearch.planninglabs.nyc/v2/search?text=<address>` (Planning Labs, free, no key). BBL at `features[0].properties.addendum.pad.bbl`.
  - PLUTO: `https://data.cityofnewyork.us/resource/64uk-42ks.json?bbl=<bbl>&$limit=1` (dataset ID discovered via Socrata catalog API, not memory). Note: `bbl` returns float-formatted (`"1008350041.00000000"`).
  - Sales: `https://data.cityofnewyork.us/resource/w2pb-icbu.json?bbl=<bbl>&$order=sale_date DESC&$limit=25` — "NYC Citywide Annualized Calendar Sales Update" (DOF). `$0` prices = non-arm's-length transfers (excluded).
- **Backend migration note (not implemented):** when the Stage 6 FastAPI backend is deployed, these three calls should move server-side (proxy + cache) to hide dataset IDs, add caching/rate-limiting, and keep working if browsers block the APIs. `client.ts` function signatures are designed to survive that move unchanged.

## 4. How to run
```bash
npm install
npm run dev      # → http://localhost:3000/property-insights
npm test         # vitest (no live API calls in tests)
```

## 5. Automated tests (actually ran)
- `npm test`: **112/112 pass** (77 existing + 35 new in `lib/property-data/property-data.test.ts`)
- New tests: BBL parsing (plain + float-format + rejects), number parsing, borough/land-use labels, full Empire State PLUTO normalization, sale normalization ($0 kept, bad dates rejected), formatters (UTC dates), compare-stat diffing (higher/newer/tie/missing), `toInsight`, and mocked-`fetch` client tests (geocode hit/miss/timeout→`timeout` code/http error, PLUTO hit/miss, sales $0-filter + 5-cap + malformed → `[]`, `lookupProperty` not-found/no-pluto/happy-path).
- `npm run lint`: 0 errors. `npm run build`: 12/12 routes prerendered, `/property-insights` present.

## 6. Manual tests
- [ ] Open `/property-insights`, enter `350 5th Ave, Manhattan`, tap "Look up property" → header "350 5 AVENUE, New York, NY, USA", Manhattan · Block 835 · Lot 41; facts show 1931, 102 stories, 513 units, assessed $577,440,900, zoning C5-3/C6-4.5; sale history shows "No recorded sales" (Empire State has none in DOF dataset).
- [ ] Enter `50 Franklin St, Manhattan` → last sale $1,800,000 (May 13, 2025) + history list; $0 transfers excluded.
- [ ] Enter gibberish (`asdf qwer zxcv`) → "We couldn't find that address" with borough hint + Try again.
- [ ] Switch to "Compare two", enter the two addresses above → side-by-side cards + comparison table with A higher/B newer badges.
- [ ] Open `/property-insights?mode=compare` directly → compare tab preselected.
- [ ] Homepage: "Property Insights" and "Compare Homes" rows show Live; Compare Homes opens compare mode.
- [ ] Contact CTA links to `/contact`; disclaimer visible without opening the panel; dark mode looks correct.

## 7. Expected result
Single lookup renders a rich property card in ~2–4s (three live API calls); compare renders two cards plus a 7-row stat table. All failures show specific, non-technical guidance — never a crash or blank page.

## 8. Troubleshooting
- **"Couldn't find that address"**: geocoder needs a recognizable NYC address — include borough ("350 5th Ave, Manhattan"). Ambiguous addresses (e.g. "350 5th Ave" exists in Manhattan AND Brooklyn) resolve to the first/best match.
- **"No property record in PLUTO"**: very new developments or non-tax lots may be absent.
- **Empty sale history**: normal for properties with no recorded arm's-length sales (e.g. Empire State Building).
- **Timeouts**: 12s per request; Socrata can be slow at peak — retry.
- **Data staleness**: PLUTO releases lag real-world changes; the disclaimer + sources panel say this explicitly.

## 9. Data limitations found
- PLUTO `bbl` is float-formatted — handled in `normalizeBbl`.
- DOF sales include $0 non-arm's-length transfers — filtered from display.
- Geocoder may return multiple boroughs for one street address — first match wins (documented in troubleshooting).
- Condo units share the lot's BBL; per-unit detail (e.g. "50 Franklin St, Apt 3A") resolves to the building record.

## 10. Next stage preview
**Stage 8 — Supabase (database/auth):** saved reports, lead capture with consent records, and the consultation request form (Stage 9 per earlier notes). The property-insights backend migration (proxy + cache) should ride along with the Stage 6 backend deployment.
