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
