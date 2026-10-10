# HomeScope NYC — Stage 5 Notes
## Seller Net Proceeds Calculator

**Status:** ✅ Code complete — `npm test` 75/75 pass (21 new), `npm run lint` clean on
all Stage 5 files, `npx tsc --noEmit` clean on all Stage 5 files. **Full
`npm run build` is blocked by the sibling Stage 4 worker's in-progress
`monthly-cost` files** (see §8) — not by Stage 5 code.
**Date:** 2026-10-10

---

## 1. What was built (and why)

The seller-side calculator, following the Stage 3 architecture: **the math
lives in a pure TypeScript engine** (`lib/calculators/`) with zero React
imports, and the page (`app/seller-proceeds/`) is a thin UI shell over it.
The headline feature is the **full deduction waterfall** — gross price →
itemized deductions → estimated net proceeds — not just the final number.

### Files created
- `lib/calculators/seller-proceeds.ts` — the engine: `nycTransferTax()`,
  `nysTransferTax()`, `validateInputs()`, `estimateProceeds()` →
  `{ salePrice, deductions, totalDeductions, netProceeds, equityBeforeCosts, assumptions }`.
  Transfer-tax constants carry verified rates + source metadata.
- `lib/calculators/seller-proceeds.test.ts` — 21 Vitest tests.
- `components/seller-proceeds/fields.tsx` — re-exports the generic
  `FieldShell` / `NumberField` / `SelectField` / `SegmentedControl` primitives
  from `components/buying-power/fields.tsx` instead of duplicating them (checked
  first — they carry no buyer-specific logic).
- `components/seller-proceeds/seller-proceeds-calculator.tsx` — the client UI:
  two form cards (Sale & loans / Selling costs) → prominent Calculate button
  → results hero with the itemized waterfall → contact CTA directly under
  results → always-visible disclaimers → assumptions panel with per-tax
  sources.
- `STAGE5_NOTES.md` — this file.

### Files changed
- `app/seller-proceeds/page.tsx` — placeholder → real calculator (metadata kept).
- `lib/nav.ts` — **NOT touched** (coordinator handles the "Live" stage tag).

---

## 2. The math

- **Net proceeds = sale price − Σ deductions** (each line rounded to the dollar;
  totals are sums of the rounded lines).
- **Deduction lines, in order:** first mortgage payoff → second mortgage /
  HELOC payoff (only shown when > 0) → broker commission (price ×
  commissionPct — a percentage of the *gross* price, illustrative default 6%,
  labeled negotiable) → NYC RPTT → NYS transfer tax → seller concessions
  (only when > 0) → attorney fee (only when > 0) → other seller costs (only
  when > 0).
- **NYC RPTT (residential: 1–3 family, individual condos, co-ops):**
  1% of the price at $500,000 or less; **1.425% of the FULL price** above
  $500,000 (not a marginal bracket — $1M owes $14,250, the city's own example).
  Verified Oct 2026: NYC Dept. of Finance RPTT page (nyc.gov) and 2024 RPTT
  report tax-rate tables.
- **NYS transfer tax:** 0.4% ($4 per $1,000) of the price when the
  consideration exceeds $500, paid by the seller (grantor). Verified Oct 2026:
  NYC Dept. of Finance 2024 RPTT report tax-rate tables (NYS Levy 0.4%).
- **Negative net proceeds are allowed** — if debts + costs exceed the price,
  the result is negative and the UI says plainly: "you'd need to bring $X to
  closing" (peach warning hero), rather than flooring at $0.
- **Commission math note:** `fmtPct()` trims trailing zeros in line labels
  (6 → "6%", 5.5 → "5.5%").

### Deliberate omissions (documented, not forgotten)
- **Capital-gains tax is excluded** — no flat formula can estimate it
  (holding period, cost basis, primary-residence exclusion). The UI carries an
  always-visible disclaimer pointing to a CPA.
- **NYS additional/supplemental transfer taxes** for NYC residential sales ≥
  $3M (0.25% additional base tax + 0.25%–2.9% supplemental): not modeled; an
  assumption line says the estimate understates taxes above that threshold.
- **Co-op flip taxes, building transfer fees** (mansion tax is buyer-paid):
  covered by the free-form "other seller costs" field.
- **Prorated taxes/HOA and interest accrued to closing day:** timing details
  the seller's attorney computes from the actual closing date.

---

## 3. Tests (all actually executed)

`npm test` → **75/75 passed** (28 Stage 3 + 26 Stage 4 + **21 new Stage 5**).
Coverage highlights for the new suite:
- Full waterfall on the known fixture ($1M price, $400k first mortgage, 6%
  commission, $2,500 attorney): lines are exactly
  [400000, 60000, 14250, 4000, 2500], total $480,750, net **$519,250**,
  equity $600,000; totals equal the sum of the displayed lines.
- RPTT bracket boundary: $500,000 → $5,000 (1%); $500,001 → $7,125
  (1.425% of the full price — first dollar above the threshold switches the rate).
- Two mortgage balances ($400k + $75k HELOC) → separate lines, equity $525,000.
- Free-and-clear (both balances 0) → no mortgage lines, net $919,250,
  assumption line says "free and clear".
- Concessions/other lines appear only when positive.
- Underwater scenario ($500k price, $550k mortgage) → negative net
  (−$87,000), still `ok: true`.
- Validation: negative/zero/NaN sale price, negative balances, commission
  outside 0–100, negative cost fields, and a multi-issue collection test.

## 4. Dependencies / environment notes

- **No new runtime dependencies** (task requirement). Reused `lucide-react`,
  shadcn-style `Card`/`Button`, and the shared field primitives.
- Vitest config needed no changes — `lib/**/*.test.ts` already covered the
  new test file.

## 5. How to run / verify

```bash
npm test                                        # 75 unit tests (21 Stage 5)
npm run lint                                    # clean on all Stage 5 files
npx tsc --noEmit                                # clean on all Stage 5 files
npm run build                                   # BLOCKED by Stage 4 sibling files (see §8)
npm run dev                                     # → http://localhost:3000/seller-proceeds
```

## 6. Manual test checklist

- [ ] Open `/seller-proceeds` — form renders, defaults filled (1,000,000 /
      400,000 / 6% / 2,500)
- [ ] Hero shows **$519,250** estimated net proceeds on defaults
- [ ] Waterfall lists: first mortgage $400,000 → commission $60,000 (6%,
      "negotiable" note) → NYC RPTT $14,250 (1.425% note) → NYS transfer tax
      $4,000 → attorney $2,500 → total deductions $480,750
- [ ] Add a $75,000 HELOC → recalculate → new line appears, net drops to $444,250
- [ ] Set both mortgages to 0 → mortgage lines disappear, "free and clear"
      assumption appears
- [ ] Underwater test: price 500,000 + mortgage 550,000 → negative hero
      "bring $87,000 to closing" with attorney warning
- [ ] Edit inputs without tapping Calculate → staleness banner appears;
      tap Calculate → "Last calculated HH:MM" stamp + smooth scroll
- [ ] Invalid input (price 0, commission 101) → warning box, no crash
- [ ] Disclaimers always visible under results: "Estimates only — not
      professional advice… consult a real-estate attorney and/or CPA" +
      capital-gains exclusion note
- [ ] Assumptions panel expands; each tax line cites its source
      (NYC Dept. of Finance)
- [ ] CTA "Contact Akash →" links to `/contact`; dark mode looks correct

## 7. Next stage preview

**Stage 6 — Property Insights:** address lookup with public-record details,
permits, violations, and nearby sales. Awaiting approval.

---

## 8. Known issue — NOT Stage 5 (flagged for the coordinator)

`npm run build` and full `npm run lint` currently fail on the **sibling Stage 4
worker's in-progress files**:
- `components/monthly-cost/monthly-cost-calculator.tsx:192` — ESLint parse
  error (`':' expected`)
- `lib/calculators/monthly-cost.ts:325` — unused `money` variable warning
- TypeScript: `ValidationIssue` is imported from `@/lib/calculators/monthly-cost`
  but not exported there (this is what fails `npm run build`'s type check)

All Stage 5 files are individually clean: `npx eslint` on the five new/changed
files → 0 problems; `npx tsc --noEmit` → no seller-related errors; `npm test`
→ 75/75 pass. Nothing was pushed to GitHub (per task instructions); `lib/nav.ts`
was not modified.
