# HomeScope NYC — Stage 4 Notes
## True Monthly Cost Calculator

**Status:** ✅ Complete — `npm run build`, `npm run lint`, and `npm test` all pass.
**Date:** 2026-10-10

---

## 1. What was built (and why)

The second working calculator. Same architecture as Stage 3: **the math lives
in a pure TypeScript engine** (`lib/calculators/`) with zero React imports,
and the page (`app/monthly-cost/`) is a thin UI shell over it.

### Files created
- `lib/calculators/monthly-cost.ts` — the engine: `calculateMonthlyCost()`
  → monthly breakdown (P&I, tax, insurance, MI, HOA) + cash-to-close with an
  illustrative NYC closing-cost model (recording tax, mansion tax, title
  insurance, attorney fee), `validateInputs()`, `recordingTax()`,
  `mansionTax()` / `mansionTaxRate()`, and the model constants. Pure
  functions only. **Reuses** `monthlyPayment()`, the loan-program configs,
  MI rules, and `CREDIT_TIERS` from Stage 3 — nothing duplicated. No
  conservative rate cushion exists anywhere in this engine (per the Stage 3
  removal), and credit tier only adjusts the illustrative rate, never the
  numbers (same compliance rule as Stage 3).
- `lib/calculators/monthly-cost.test.ts` — 26 Vitest tests.
- `components/monthly-cost/monthly-cost-calculator.tsx` — the client UI:
  form cards → results hero (big monthly total + monthly breakdown + cash
  to close with closing-cost line items), contact CTA under results,
  always-visible disclaimer, NYC area-variance note, collapsible
  "Assumptions & sources" panel. Same UX patterns as Stage 3: Calculate
  button applies draft inputs, staleness banner, "Last calculated" stamp,
  plain-language explainer ("What drives this number?").
- `STAGE4_NOTES.md` — this file.

### Files changed
- `app/monthly-cost/page.tsx` — placeholder → real calculator (metadata kept).
- `lib/nav.ts` — **NOT touched** (coordinator handles nav updates).

### Deliberate reuse (no new fields.tsx)
- The form primitives in `components/buying-power/fields.tsx`
  (FieldShell / NumberField / SelectField / SegmentedControl) are fully
  generic — no buying-power-specific logic — so `monthly-cost-calculator.tsx`
  imports them directly from `@/components/buying-power/fields` instead of
  duplicating them.

---

## 2. The math

- **Monthly cost:** P&I via Stage 3's `monthlyPayment()` on the financed loan
  (base loan = price − down, plus any financed upfront MIP/funding fee) +
  tax/12 + insurance/12 + monthly MI per the Stage 3 program rules
  (conventional PMI 0.50%/yr while down < 20%; FHA 1.75% upfront financed +
  0.55%/yr; VA no monthly MI, 2.15% funding fee financed) + HOA.
- **Cash to close** = down payment + the NYC closing-cost model:
  - **Mortgage recording tax (borrower-paid portion):** 1.80% of the loan
    for loans under $500,000; 1.925% at $500,000 or more. (Total
    residential MRT is 2.05%/2.175%; the lender pays the other 0.25%.)
    Computed on the *financed* loan amount (including financed MIP/fee).
    Sources: NYS Tax Law; buyer share per NYS Form MT-15 Table 4
    (NYC Dept. of Finance).
  - **Mansion tax (buyer-paid):** graduated tiers on the *entire* price
    (not marginal): 1% at $1–2M, 1.25% at $2–3M, 1.5% at $3–5M, 2.25% at
    $5–10M, 3.25% at $10–15M, 3.5% at $15–20M, 3.75% at $20–25M, 3.9% at
    $25M+. Zero below $1M. Sources: NYS Tax Law §1402-a (1% statewide) +
    §1402-b (NYC graduated supplemental).
  - **Title insurance:** illustrative 0.45% of price (industry rule of
    thumb; actual premiums follow the NY-regulated TIRSA schedule).
  - **Attorney fee:** illustrative flat $3,500 (typical NYC buyer range
    $2,000–$5,000).
  - **Lender & third-party fees (misc., illustrative):** allowance for
    lender origination/underwriting/processing, appraisal, credit & flood
    reports, plus the home inspection — inspection and appraisal are
    typically paid out of pocket BEFORE closing day. Calibrated so total
    buyer closing costs land at ≈2.5% of price (a commonly cited NYC
    benchmark); $0 when the modeled lines already meet or exceed it
    (e.g., mansion-tax cases), with an assumptions note saying so.
  - **Co-op note:** the model assumes a condo/house purchase. Co-op share
    loans record no real-property mortgage (no recording tax; UCC-1 filing
    instead). **Co-op flip tax is building-specific and EXCLUDED** from the
    estimate — stated in the assumptions panel.

### Deliberate omissions (documented, not forgotten)
- **No property-type selector:** a co-op/condo toggle would make the
  recording-tax line more accurate for co-op buyers, but the spec fixed the
  input list and the model instead labels its condo/house assumption with
  the co-op note and flip-tax exclusion. Candidate enhancement for a later
  pass (flagged in the handoff report).
- **No sensitivity section:** not in the spec; the plain-language
  "What drives this number?" explainer covers intuition cheaply.
- **Down-payment dual mode:** kept (percent/$) for consistency with Stage 3.

---

## 3. Tests (all actually executed)

`npm test` → **75/75 passed** (28 Stage 3 + 21 Stage 5 + 26 new Stage 4).
Stage 4 coverage highlights:
- Known fixture: $600k, 20% down, 6.5%/30yr, $7,200 tax, $1,800 ins,
  $500 HOA → P&I ≈ $3,033.93 (independently verified via the $400k
  fixture), MI $0, total ≈ $4,283.93.
- Conventional PMI $225/mo at 10% down, $0 at 20% down.
- FHA: upfront MIP financed (mortgageAmount = base × 1.0175) + monthly
  MIP = loan × 0.55%/12.
- VA: no monthly MI, funding fee financed (mortgageAmount = price × 1.0215).
- Cash-to-close at $1.2M: recording tax $20,790 (1.925% of $1.08M loan) +
  mansion tax $12,000 (1% of full price) + title $5,400 + attorney $3,500 +
  $120k down = **$161,690**; mansion line omitted below $1M.
- Recording-tax bracket boundary at exactly $500k (higher rate); mansion
  tax entire-price-not-marginal ($2M → $25,000, not $12,500).
- HOA equivalence: +$500 HOA moves total exactly $500, cash-to-close
  unchanged. 0% rate → principal/months. Credit tier adjusts effective
  rate only — cash-to-close identical (no multiplier, no gating).
- Validation: negative price, NaN rate, down payment > price, below program
  minimum, negative HOA, unknown program/tier, non-integer term, and
  multi-error aggregation.

Two fixes were needed after first write (caught by lint/build, both
fixed before completion): a conditional-spread JSX construct confused the
ESLint parser (rewritten imperatively) and `ValidationIssue` needed a
re-export from monthly-cost.ts for the UI import.

## 4. Dependencies / environment notes

- No new runtime dependencies.
- Quirk observed: a sibling worker's `next build` was running concurrently
  and the first build attempt refused with "Another next build process is
  already running" — waited and retried; nothing else needed.

## 5. How to run / verify

```bash
npm test        # 75 unit tests (26 in monthly-cost.test.ts)
npm run lint    # 0 errors
npm run build   # 12/12 routes prerendered, incl. /monthly-cost
npm run dev     # → http://localhost:3000/monthly-cost
```

## 6. Manual test checklist

- [ ] Open `/monthly-cost` — form renders, defaults filled (650k / 20% /
      6.5% / 30yr / 6k tax / 1.8k ins / 0 HOA / Conventional)
- [ ] Hero shows a monthly total; breakdown lists P&I / tax / insurance /
      HOA; MI row appears only when applicable (try 10% down → PMI shows)
- [ ] Cash to close lists: down payment + recording tax + mansion tax
      (only at $1M+) + title insurance + attorney fee, and sums correctly
- [ ] Try $1.2M price: mansion tax line shows 1.00% = $12,000
- [ ] Try FHA: upfront MIP note in assumptions; monthly MIP in breakdown
- [ ] Invalid input (e.g. 2% down conventional) shows the warning box, no crash
- [ ] Edit an input after calculating → staleness banner appears; tap
      Calculate → "Last calculated" updates, smooth-scrolls to results
- [ ] Assumptions panel expands; each closing-cost line cites its source;
      disclaimer visible under results without opening the panel
- [ ] CTA links to `/contact`; dark mode looks correct throughout

## 7. Next stage preview

**Stage 5 — Seller Net Proceeds Calculator:** sale price → net proceeds
after mortgage payoff, broker commission, transfer taxes, and seller
closing costs. Awaiting approval (note: Stage 5 files may already exist in
the tree from a sibling worker — check `lib/calculators/seller-proceeds*`).
