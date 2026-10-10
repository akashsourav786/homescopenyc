# Stage 8 — What's My Home Worth?

> Note: the *old* Stage 8 (Supabase auth for saved reports) was cancelled
> 2026-10-10 at Akash's direction — the Saved Reports feature was removed
> entirely (`/saved-reports` route deleted, nav entry removed). This is the
> new Stage 8: the comp-based home value estimator at `/home-worth`.

## 1. Stage
**Stage 8 — What's My Home Worth?** (`/home-worth`): enter any NYC home address and get a transparent value RANGE estimated from recent nearby comparable closed sales. Honest framing throughout — a comp-based rough estimate, never an appraisal, never a single fake-precise number. Homepage "What's My Home Worth?" row flipped to "Live".

## 2. Objective
Give homeowners (and curious buyers) an instant, methodology-transparent value range from official NYC sales data — with the comps shown, not hidden — while routing low-confidence cases (condos, thin sales history) to a human CMA instead of fabricating a number. The "Want a professional CMA?" CTA is the seller lead-gen hook.

## 3. Implementation
- **`lib/property-data/home-worth.ts`** — new estimator module reusing Stage 7 plumbing (`geocodeAddress`, `getPropertyProfile`, `fetchJson` — now exported from `client.ts`):
  - Pure functions: `parseSqft` (handles DOF's comma-formatted `"3,096"`), `classLetter` (first letter of building class), `classLetterLabel`, `median`, `roundToNearest1k`, `formatRangeK` ("$735K"), `normalizeCompSale` (rejects $0/missing prices, missing sqft, bad dates).
  - `estimateFromComps(subject, compRows)`: median comp $/sqft × subject PLUTO `bldgarea` = midpoint; range = midpoint ±10% (nearest $1k). Requires ≥3 valid comps and subject sqft > 0 — otherwise `ok:false` with reason `"no-subject-sqft"` / `"few-comps"`, never a fabricated number.
  - `getComparableSales(zip, letter, sinceIso)`: Socrata SoQL on `w2pb-icbu` — `zip_code='<zip>' AND starts_with(building_class_at_time_of,'<letter>') AND sale_date >= '<iso>' AND sale_price > 0`, `$order=sale_date DESC`, `$limit=20`.
  - `estimateHomeValue(address)`: full pipeline; throws `PropertyDataError` for `not-found`/`no-pluto`, returns `ok:false` for data-insufficient cases.
- **Comp methodology (verified live 2026-10-10):** same ZIP + same building-class *letter* (verified: A*→one-family, B*→two-family, C*→walk-ups, D*→elevator/co-op, R*→condos — the dataset's category labels have inconsistent spacing, so the letter prefix is the reliable key), sold within 365 days, price \u2265 $1,000 ($0 and nominal transfers like $10 LLC moves are excluded as non-arm's-length \u2014 verified live: 2 of the 5 newest Bronx 10467 comps were $10 nominal transfers). Comp $/sqft uses each sale row's `gross_square_feet` — the sqft the price was actually paid for (a batched PLUTO lookup was considered and rejected: the sales row's own figure is more correct and avoids a second query).
- **`components/home-worth/home-worth.tsx`** — UI: address form → "Estimate my home's value" (dark-teal, full-width) → loading skeleton → results: big range hero (`$735K – $895K`), midpoint, median $/sqft, comp count; "Comparable sales used" list (up to 8: address, date, price, $/sqft); "How we estimated this" plain-language explainer; compact subject-facts strip (the estimate's PLUTO inputs); tailored "not enough data" cards (vacant-land vs thin-history vs condo/co-op messaging); "Want a professional CMA?" CTA under results; always-visible "not an appraisal" disclaimer; assumptions & sources panel (datasets + access date + criteria).
- **`app/home-worth/page.tsx`** — thin shell replacing the placeholder (metadata + description).
- **`lib/nav.ts`** — home-worth TOOLS row `stage`: `"Stage 7"` → `"Live"` (only change).
- **Stage 7 touch-ups (reuse, no redesign):** exported `fetchJson` (client.ts) and `AddressField`/`LoadingSkeleton`/`StatusMessage` (property-insights.tsx) for the new UI — zero duplicated markup.

## 4. How to run
```bash
npm install
npm run dev      # → http://localhost:3000/home-worth
npm test         # vitest (no live API calls in tests)
```

## 5. Automated tests (actually ran)
- `npm test`: **143/143 pass** (112 existing + 31 new in `lib/property-data/home-worth.test.ts`)
- New tests: `parseSqft` (comma strings, null/empty/zero/negative), `classLetter`/`classLetterLabel`, `median` (odd/even/empty), `roundToNearest1k`, `formatRangeK`, `normalizeCompSale` ($0/missing-price/missing-sqft/bad-date rejections), `estimateFromComps` (happy path $1.2M midpoint ±10%, even-count median, invalid-row filtering, `few-comps`, `no-subject-sqft`, criteria note), `getComparableSales` URL-shape assertions + non-array → `parse` error (all mocked `fetch`), `lookbackIso`, and full-pipeline `estimateHomeValue` tests (happy path, geocoder miss → `not-found`, PLUTO miss → `no-pluto`, thin sales → `few-comps`, no building sqft → `no-subject-sqft`). Two test-expectation arithmetic slips caught and fixed during development (median 500 × 2400 sqft = $1,200,000, not $1,000,000 — the code was right).
- `npm run lint`: 0 errors, 0 warnings. `npm run build`: 12/12 routes prerendered, `/home-worth` present.

## 6. Manual tests
- [ ] Open `/home-worth`, enter a Bronx two-family address (e.g. `610 Waring Avenue, Bronx`) → range hero renders, comps list shows nearby B-class sales with $/sqft, explainer reads sensibly.
- [ ] Enter a Manhattan condo address (e.g. `75 Wall Street, Manhattan`) → graceful "Not enough comparable sales" card explaining condo unit sqft isn't in public data + CMA CTA (no fabricated number).
- [ ] Enter gibberish → "We couldn't find that address" with borough hint.
- [ ] Homepage "What's My Home Worth?" row shows Live and links to `/home-worth`.
- [ ] Contact CTA links to `/contact`; disclaimer visible without opening the panel; dark mode looks correct.

## 7. Expected result
Address → estimate in ~3–5s (three live API calls: geocode, PLUTO, sales). Range hero with transparent comps for data-rich property types; honest "not enough data" states for condos/co-ops and thin markets. Never a crash, never a fabricated valuation.

## 8. Troubleshooting
- **"Not enough comparable sales"**: needs ≥3 valid comps (same ZIP + class letter, 12 months, price > 0, known sqft). Thin markets and condo/co-op units (no sqft in DOF data) hit this by design.
- **"We can't estimate this property"**: subject lot has no `bldgarea` in PLUTO (vacant land, data gaps).
- **"Couldn't find that address"**: include the borough; ambiguous addresses resolve to the best geocode match.
- **Wide ranges on odd comps**: one distressed or luxury outlier moves the median — the comp list is shown precisely so users can judge.

## 9. Data limitations found
- DOF `gross_square_feet` arrives comma-formatted — parsed in `parseSqft`.
- Condo/co-op unit sales have `gross_square_feet: null` — no $/sqft possible; routed to manual CMA messaging.
- `building_class_category` labels have inconsistent spacing ("01 " vs "01  ") — matched on `building_class_at_time_of` first letter instead.
- PLUTO `bldgarea` is whole-building; for 1–3 family homes this is the right multiplier.
- The ±10% band is a presentation convention, not a confidence interval — the explainer says renovations/condition aren't in public records.

## 10. Next stage preview
Remaining roadmap: lead consultation form (needs a storage decision for requests + consent records — Supabase or alternative, TBD with Akash). The property-data backend migration (proxy + cache) should ride along with the Stage 6 backend deployment whenever Akash connects a hosting account.
