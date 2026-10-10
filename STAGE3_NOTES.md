# HomeScope NYC — Stage 3 Notes
## Buyer Qualification Calculator (first real tool)

**Status:** ✅ Complete — `npm run build`, `npm run lint`, and `npm test` all pass.
**Date:** 2026-10-10

---

## 1. What was built (and why)

The first working calculator. The key architectural decision: **the math lives
in a pure TypeScript engine** (`lib/calculators/`) with zero React imports, and
the page (`app/buying-power/`) is a thin UI shell over it. This means:
- The money math is unit-testable without a browser (15 Vitest tests).
- Stage 4 (True Monthly Cost) and Stage 5 (Seller Proceeds) can reuse
  `monthlyPayment()` and the loan-program configs instead of duplicating them.
- If we ever add a Python/FastAPI backend (Stage 6+), the formulas are
  isolated in one place to port.

### Files created
- `lib/calculators/loan-programs.ts` — Conventional / FHA / VA configs: min
  down %, DTI caps (standard + conservative), mortgage-insurance rules, plus
  `source` + `effectiveDate` metadata shown in the UI assumptions panel.
  Also `CREDIT_TIERS` (optional score ranges).
- `lib/calculators/buyer-qualification.ts` — the engine: `monthlyPayment()`,
  `validateInputs()`, `qualifyBuyer()` → `{ conservative, higher }`,
  `sensitivity()` (what-if analysis). Pure functions only.
- `lib/calculators/buyer-qualification.test.ts` — 15 Vitest tests.
- `components/buying-power/fields.tsx` — NumberField / SelectField /
  SegmentedControl primitives in the HomeScope visual language.
- `components/buying-power/buying-power-calculator.tsx` — the client UI:
  live form → results hero (price range), scenario toggle, monthly breakdown,
  DTI bars, what-if section, collapsible assumptions, disclaimer, and the
  "Talk to Akash about your options" CTA.
- `vitest.config.ts` — node environment, `lib/**/*.test.ts`.

### Files changed
- `app/buying-power/page.tsx` — placeholder → real calculator (metadata kept).
- `lib/nav.ts` — "How Much Can I Buy?" stage tag: `"Stage 3"` → `"Live"`.
- `package.json` — added `test` script; devDeps: `vitest`, `vite`.

---

## 2. The math

- **Monthly payment:** M = P·r(1+r)ⁿ / ((1+r)ⁿ − 1); at 0% it's P/n.
- **Housing budget:** `min(income × frontDTI, income × backDTI − debts)`.
  The tighter of the two DTI caps binds (reported as the binding constraint).
- **Max price, closed form (no iteration needed):** total monthly cost is
  *linear* in price — P&I scales with the financed amount while tax/insurance/
  HOA are fixed inputs — so `monthlyCost(P) = P·k + c` solves directly as
  `P = (budget − c) / k`. The result is then capped by cash:
  `down + price × closingCostPct ≤ savings`. Max price is floored to $1,000.
- **Mortgage insurance:** Conventional PMI (illustrative 0.50%/yr) applies while
  down < 20% and drops at 80% LTV; FHA = 1.75% upfront financed + 0.55%/yr;
  VA = no monthly MI, 2.15% funding fee financed. All labeled illustrative.
- **Scenarios:** *higher* = program's standard DTI caps; *conservative* =
  tighter caps + a +0.50% illustrative rate cushion (clearly labeled).
  The headline range is [conservative.maxPrice, higher.maxPrice].
- **Credit score:** optional range select. It ONLY picks an illustrative rate
  adjustment (+0% / +0.25% / +0.50% / +0.75%), shown in assumptions. It never
  multiplies buying power and never gates anything — a deliberate compliance
  choice (we are not a lender or credit agency).

### Deliberate omissions (documented, not forgotten)
- **Location / property type / occupancy selects** were omitted: they don't
  change the math yet, and a select that does nothing is fake functionality.
  They can arrive with Stage 6 (property data) when location actually matters.
- **Down-payment minimum in amount mode** is enforced against the *solved*
  price (can't be checked before the solve), returning a clear validation error.

---

## 3. Tests (all actually executed)

`npm test` → **15/15 passed.** Coverage highlights:
- `monthlyPayment(400000, 6.5, 30)` ≈ $2,528.27 (independently verified value,
  ±0.05) + 0%-rate edge case.
- Zero debts → back-end DTI equals front-end DTI; front-end binds.
- Monotonicity: higher rate → lower max price.
- Down payment > savings → `DOWN_PAYMENT_EXCEEDS_SAVINGS`.
- Conservative price ≤ higher price.
- FHA 3.5%-down path works, MIP applied, upfront MIP financed into the loan.
- Conventional PMI present < 20% down, absent at 20%+.
- VA: no monthly MI, funding fee financed.
- Cash binding: high income + low savings → `bindingConstraint: "cash available"`.
- Sensitivity deltas move in the expected directions; bad inputs return issues.

One test initially failed (my expectation, not the engine): +$500 debts didn't
move the price because the *front-end* DTI was binding — the test now uses
inputs where back-end DTI binds, which also documents how the binding
constraint works.

---

## 4. Dependencies / environment notes

- `vitest` + `vite` added as devDependencies. Install quirk: vitest 5's
  peerOptional `@types/node@^22 || >=24` conflicts with the project's
  `@types/node@^20`, so both were installed with `--legacy-peer-deps`.
  This is safe here — the peer is type-only and doesn't affect the test
  runtime — but it's worth knowing if the error ever resurfaces.
- No new runtime dependencies. Theme/dark mode untouched.

## 5. How to run / verify

```bash
npm install        # picks up vitest
npm test           # 15 unit tests
npm run lint       # 0 errors
npm run build      # production build
npm run dev        # → http://localhost:3000/buying-power
```

## 6. Manual test checklist

- [ ] Open `/buying-power` — form renders, defaults filled (120k / 500 / 100k…)
- [ ] Range hero shows two prices; toggling Conservative/Higher changes details
- [ ] Breakdown lists P&I / tax / insurance / HOA; MI row appears only when applicable
- [ ] DTI bars render with caps; binding constraint line reads sensibly
- [ ] What-if section: 4 factors × ± changes, deltas colored and signed correctly
- [ ] Assumptions panel expands; lists program source + effective date
- [ ] Disclaimer visible: "not a loan approval or preapproval"
- [ ] Invalid input (e.g. income 0, down payment > savings) shows the warning box, no crash
- [ ] CTA links to `/contact`; dark mode looks correct throughout

## 7. Next stage preview

**Stage 4 — True Monthly Cost Calculator:** purchase-price → full monthly
breakdown (P&I, taxes, insurance, MI, HOA), closing-costs and cash-to-close
math, reusing this stage's engine. Awaiting approval.

---

## 8. Update 2026-10-10 — post-launch calibration (still Stage 3)

Akash tested the live calculator against a real client file: $130k income,
10% down ($71k), $6k/yr Bronx taxes, 740+ credit, no debt → lender approved
**$710k**. The engine's "higher" scenario produced only **$384k**.

**Diagnosis.** The binding constraint was the 28% front-end DTI cap
($3,033/mo budget). The 28/36 caps are manual-underwriting guidelines; real
lenders use automated underwriting — Fannie Mae's Desktop Underwriter
approves up to **50% DTI** with compensating factors (exactly this client's
profile: 740+ score, zero debt, 10% down). The client's actual approval ran
at 46.2% DTI ($5,005/mo ÷ $10,833/mo).

**Fix — recalibrated `dtiCaps` (the "higher" scenario) in loan-programs.ts:**
- Conventional: 28/36 → **45/50** (DU maximums; note that many lenders
  overlay at 45%). Conservative stays 25/33 — it is the conservative view.
- FHA: 31/43 → **47/57** (TOTAL Scorecard maximums 46.99/56.99).
- VA: 41/41 → **45/50** (judgment call: VA has no hard max; 41% is the
  traditional guideline; AUS approves higher with residual income — the
  residual-income test itself remains unmodeled, documented in the note).
- All three programs: `effectiveDate` → 2026-10, notes rewritten to cite the
  AUS basis and warn about lender overlays.
- Verified: the same client inputs now produce **$688k** (higher scenario) —
  right at the real $710k approval. A regression test pins the $650k–$750k
  band so future cap edits can't silently regress.

**Multifamily + rental income (new feature, Akash-approved design):**
- Property-type selector: Single-family / 2-unit / 3–4 units.
- Multifamily reveals a "Monthly rental income from the other unit(s)" field
  (user-entered); the engine counts **75%** toward qualifying income
  (`RENTAL_INCOME_HAIRCUT` in loan-programs.ts, sourced to Fannie Mae rental-
  income guidelines, labeled illustrative — lenders verify with signed leases
  or an appraisal). DTI budgets and reported DTI ratios use the effective
  (rental-boosted) qualifying income, which is what lenders do.
- Unit-count minimum down payments (conventional): 3% / 15% / 25% per
  conforming LTV limits; FHA 3.5% all; VA 0% all. Encoded per-program as
  `minDownPctByUnits`, enforced in validation (percent mode) and in the
  post-solve amount-mode check, with messages naming the requirement.
- Assumptions panel shows the rental math
  ("75% × $2,000/mo = $1,500/mo") and the unit-adjusted minimum down.
- UI: segmented property-type control, conditional rental field with a
  prominent verification note, a bold multifamily callout at the top of the
  page, unit-aware program labels ("min 15% down") and down-payment hints.
  The mortgage-professional disclaimer now also sits **directly under the
  results** (still duplicated inside the assumptions panel).

**Tests:** 22/22 pass (was 15). New: client-scenario regression ($650k–$750k
band); rental income raises price; exactly-75% haircut (rent-input ≡ income-
input equivalence); 3–4 unit + 10% down rejected citing 25%; 2-unit + 15%
down accepted; zero rent on multifamily ≡ single-family; negative rent
rejected. Two pre-existing tests needed expectation fixes after the cap
change (both were test-side, not engine bugs): the sensitivity suite now uses
$200k savings so the DTI solve (not the cash cap) binds, and the multifamily
tests use $300k savings for the same reason — documented in the test file.

**Verification (actually ran):** `npm test` 22/22 ✅ · `npm run lint` 0
errors ✅ · `npm run build` 12/12 routes prerendered ✅.

## 9. Update 2026-10-10 — conservative scenario raised, sourced assumptions, CTA placement (still Stage 3)

Akash's feedback: the conservative scenario was too low and the
$315k–$688k spread was confusingly wide. Research confirmed 43% back-end DTI
is the decade-long QM standard (CFPB General QM Rule; the 43% cap was replaced
by the APOR price test in July 2021 but lives on as the most common lender
overlay), and Fannie Mae manual underwriting runs 36% base / 45% with
compensating factors (Selling Guide B3-6-02).

**Changes:**
- **Conservative caps raised:** conventional 25/33 → **33/43** (43% back-end
  = the QM-legacy "approved without drama" line; 33% front-end = comfortable
  housing ratio); FHA 28/40 → **31/43** (Handbook 4000.1 standard ratios);
  VA 38/38 → **41/41** (VA Lenders Handbook traditional guideline). "Higher"
  caps unchanged (45/50, 47/57, 45/50). Program notes updated to explain the
  conservative basis.
- **Rate cushion removed:** the +0.50% illustrative cushion on the
  conservative scenario is gone (`CONSERVATIVE_RATE_BUFFER_PCT` deleted).
  Both scenarios now price the same loan (base rate + credit-tier
  adjustment); the spread reflects two underwriting standards, not two
  different loans. Client fixture: conservative **$474k** (front-end binding
  at 33%) vs higher **$688k** — a 1.45x spread instead of 2.2x.
- **Sourced assumptions:** new `dtiCapJustifications(program, scenario)`
  helper in loan-programs.ts; the assumptions panel now shows per-scenario
  source lines (e.g., "Fannie Mae Selling Guide B3-6-02", "Handbook 4000.1",
  "CFPB General QM Rule", "VA Lenders Handbook") plus the manual-underwriting
  reference (36%/45%, B3-6-02) for conventional.
- **NYC area-variance note:** always-visible line under the results —
  "Estimates can vary by neighborhood — property taxes, insurance costs, and
  HOA/maintenance fees differ across NYC boroughs and surrounding areas."
- **Contact CTA moved:** "Want a better understanding of these numbers?
  Contact Akash →" now sits **directly under the results**, before the
  scenario toggle inputs and what-if section (the old bottom CTA was removed
  as a duplicate). The mortgage-professional disclaimer placement from the
  previous update is unchanged.

**Tests:** 25/25 pass (was 22). New: client-fixture conservative pinned to
$472k–$476k (front-end DTI binding); conservative ≡ higher effective rate
(no cushion); assumption text contains "B3-6-02" (conventional) and "4000.1"
(FHA). No existing tests broke — the cushion removal only affected the
conservative solve, and the higher-scenario regression band still holds.

**Verification (actually ran):** `npm test` 25/25 ✅ · `npm run lint` 0
errors ✅ · `npm run build` 12/12 routes prerendered ✅.
