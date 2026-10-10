/**
 * True Monthly Cost Calculator — pure calculation engine.
 *
 * Zero React imports: every function here is a pure function of its inputs,
 * which makes the math fully unit-testable (see monthly-cost.test.ts).
 *
 * ## What it computes
 *
 * 1. **Monthly cost** for a given purchase price: P&I on the financed loan
 *    (reusing `monthlyPayment()` and the loan-program configs from Stage 3),
 *    plus property tax, homeowner's insurance, mortgage insurance per the
 *    Stage 3 MI rules, and HOA/maintenance.
 *
 * 2. **Cash to close**: the down payment plus an illustrative NYC
 *    closing-cost model — mortgage recording tax (borrower-paid portion),
 *    mansion tax, title insurance, attorney fee, plus an illustrative
 *    lender & third-party fees (misc.) allowance calibrated so total buyer
 *    closing costs land at ≈2.5% of price.
 *
 * ## NYC closing-cost model
 *
 * The whole model is ILLUSTRATIVE. The tax figures are real, current
 * statutory rates (buyer-paid portions only); title insurance and attorney
 * fees are flat industry rule-of-thumb estimates. Co-op purchases record no
 * real-property mortgage (no recording tax) — this model assumes a
 * condo/house purchase, and co-op flip taxes are building-specific and
 * EXCLUDED from the estimate. Every line item carries its source, shown in
 * the UI assumptions panel one line per item.
 *
 * All figures are ESTIMATES. Nothing here is, or implies, a loan approval.
 */

import {
  LOAN_PROGRAMS,
  getCreditTier,
  getMinDownPct,
  type LoanProgram,
  type LoanProgramId,
} from "./loan-programs";
import {
  monthlyPayment,
  type DownPaymentInput,
  type ValidationIssue,
  type ValidationResult,
} from "./buyer-qualification";

/** Re-exported so UI code can import all engine types from one place. */
export type { LoanProgramId, DownPaymentInput, ValidationIssue, ValidationResult };

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface MonthlyCostInputs {
  /** Purchase price, dollars. */
  purchasePrice: number;
  downPayment: DownPaymentInput;
  /** Base annual rate in percent (e.g. 6.5). Credit-tier adjustment adds on. */
  annualRatePct: number;
  loanTermYears: number;
  /** Annual property tax bill, dollars. */
  annualPropertyTax: number;
  /** Annual homeowner's insurance premium, dollars. */
  annualInsurance: number;
  /** Monthly HOA / maintenance fees, dollars. */
  monthlyHOA: number;
  loanProgramId: LoanProgramId;
  /**
   * Optional credit-tier id (see CREDIT_TIERS). IMPORTANT: never multiplies
   * anything and never gates anything — it only picks the illustrative rate
   * adjustment, exactly like Stage 3.
   */
  creditTierId?: string;
}

export interface MonthlyCostBreakdown {
  principalAndInterest: number;
  propertyTax: number;
  insurance: number;
  hoa: number;
  mortgageInsurance: number;
  total: number;
}

export interface ClosingCostLine {
  label: string;
  amount: number;
  /** One-line source citation, shown in the assumptions panel. */
  source: string;
  /** True for rule-of-thumb estimates (title insurance, attorney fee, misc lender fees). */
  illustrative: boolean;
}

export interface MonthlyCostResult {
  purchasePrice: number;
  downPaymentAmount: number;
  /** Down payment as a fraction (0.2 = 20%). */
  downPct: number;
  /** Loan amount actually financed (includes financed upfront MI/fees). */
  mortgageAmount: number;
  /** Rate actually used, after the credit-tier adjustment. */
  effectiveRatePct: number;
  monthly: MonthlyCostBreakdown;
  /** Non-zero closing-cost lines; down payment is separate. */
  closingCosts: ClosingCostLine[];
  closingCostsTotal: number;
  cashToClose: number;
  /** Buyer-side mansion-tax rate applied (null when price < $1M). */
  mansionTaxRate: number | null;
  /** Human-readable assumption lines for the UI assumptions panel. */
  assumptions: string[];
}

export type MonthlyCostOutcome =
  | { ok: true; value: MonthlyCostResult }
  | { ok: false; issues: ValidationIssue[] };

/* ------------------------------------------------------------------ */
/* NYC closing-cost model                                              */
/* ------------------------------------------------------------------ */

/**
 * NYC mortgage recording tax — BORROWER-PAID portion only, applied to the
 * loan amount. The total residential MRT is 2.05% (< $500k) / 2.175%
 * ($500k+); the lender pays the other 0.25%.
 * Source: NYS Tax Law; buyer share per NYS Form MT-15 Table 4 (NYC Dept. of
 * Finance). The small $30 credit on 1–2 family homes is not modeled —
 * illustrative.
 */
export const MRT_BRACKET = 500000;
export const MRT_RATE_UNDER_500K = 0.018;
export const MRT_RATE_500K_PLUS = 0.01925;

export function recordingTax(loanAmount: number): number {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) return 0;
  const rate =
    loanAmount < MRT_BRACKET ? MRT_RATE_UNDER_500K : MRT_RATE_500K_PLUS;
  return loanAmount * rate;
}

/**
 * NYC buyer-side mansion tax — graduated tiers on the ENTIRE purchase price
 * (not marginal: crossing a threshold re-prices the whole deal).
 * Base 1% statewide (NYS Tax Law §1402-a) + NYC supplemental §1402-b for
 * cities of one million or more. Below $1M there is no mansion tax.
 */
const MANSION_TIERS: { min: number; rate: number }[] = [
  { min: 25_000_000, rate: 0.039 },
  { min: 20_000_000, rate: 0.0375 },
  { min: 15_000_000, rate: 0.035 },
  { min: 10_000_000, rate: 0.0325 },
  { min: 5_000_000, rate: 0.0225 },
  { min: 3_000_000, rate: 0.015 },
  { min: 2_000_000, rate: 0.0125 },
  { min: 1_000_000, rate: 0.01 },
];

export function mansionTaxRate(price: number): number | null {
  for (const t of MANSION_TIERS) {
    if (price >= t.min) return t.rate;
  }
  return null;
}

export function mansionTax(price: number): number {
  const rate = mansionTaxRate(price);
  return rate === null ? 0 : price * rate;
}

/**
 * Illustrative title insurance premium as a fraction of the price.
 * Industry rule of thumb for NYC condo/house purchases; actual premiums
 * follow the NY-regulated TIRSA rate schedule and vary by insurer and
 * endorsements. Labeled illustrative everywhere it appears.
 */
export const TITLE_INSURANCE_PCT = 0.0045;

/**
 * Illustrative flat buyer-side attorney fee. Typical NYC buyer range
 * $2,000–$5,000; this flat midpoint is a placeholder, labeled illustrative.
 */
export const ATTORNEY_FEE = 3500;
export const ATTORNEY_FEE_RANGE = "$2,000–$5,000";

/**
 * Illustrative benchmark: total buyer closing costs target this fraction of
 * the purchase price. NYC buyer closing costs are commonly cited at 2–5% of
 * price (condo/house); this model targets the low end. A "misc" lender &
 * third-party fees line fills the gap between the modeled tax/title/attorney
 * lines and this benchmark — it is $0 when those lines already meet or
 * exceed it (e.g., mansion-tax cases). Labeled illustrative everywhere.
 */
export const MISC_CLOSING_TARGET_PCT = 0.025;

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function issue(
  field: string,
  code: string,
  message: string,
): ValidationIssue {
  return { field, code, message };
}

export function validateInputs(
  inputs: MonthlyCostInputs,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

  if (!num(inputs.purchasePrice) || inputs.purchasePrice <= 0) {
    issues.push(
      issue(
        "purchasePrice",
        "INVALID_PRICE",
        "Purchase price must be greater than $0.",
      ),
    );
  }

  const program = LOAN_PROGRAMS[inputs.loanProgramId];
  if (!program) {
    issues.push(
      issue("loanProgramId", "UNKNOWN_PROGRAM", "Unknown loan program."),
    );
  } else {
    // Stage 4 has no property-type input; single-family minimums apply.
    const minDown = getMinDownPct(program, "single");
    const minDownLabel = `${(minDown * 100).toFixed(1)}%`;
    const dp = inputs.downPayment;
    if (dp.mode === "percent") {
      if (!num(dp.pct) || dp.pct < 0 || dp.pct > 100) {
        issues.push(
          issue(
            "downPayment",
            "INVALID_DOWN_PAYMENT",
            "Down payment must be between 0% and 100%.",
          ),
        );
      } else if (dp.pct / 100 < minDown) {
        issues.push(
          issue(
            "downPayment",
            "BELOW_PROGRAM_MINIMUM",
            `${program.name} requires at least ${minDownLabel} down.`,
          ),
        );
      }
    } else {
      if (!num(dp.amount) || dp.amount < 0) {
        issues.push(
          issue(
            "downPayment",
            "INVALID_DOWN_PAYMENT",
            "Down payment can't be negative.",
          ),
        );
      } else if (num(inputs.purchasePrice)) {
        if (dp.amount > inputs.purchasePrice) {
          issues.push(
            issue(
              "downPayment",
              "DOWN_PAYMENT_EXCEEDS_PRICE",
              "Down payment can't exceed the purchase price.",
            ),
          );
        } else if (dp.amount / inputs.purchasePrice < minDown) {
          issues.push(
            issue(
              "downPayment",
              "BELOW_PROGRAM_MINIMUM",
              `${program.name} requires at least ${minDownLabel} down.`,
            ),
          );
        }
      }
    }
  }

  if (
    inputs.creditTierId !== undefined &&
    !getCreditTier(inputs.creditTierId)
  ) {
    issues.push(
      issue("creditTierId", "UNKNOWN_TIER", "Unknown credit score range."),
    );
  }
  if (
    !num(inputs.annualRatePct) ||
    inputs.annualRatePct < 0 ||
    inputs.annualRatePct > 25
  ) {
    issues.push(
      issue(
        "annualRatePct",
        "INVALID_RATE",
        "Interest rate must be between 0% and 25%.",
      ),
    );
  }
  if (
    !Number.isInteger(inputs.loanTermYears) ||
    inputs.loanTermYears <= 0 ||
    inputs.loanTermYears > 40
  ) {
    issues.push(
      issue(
        "loanTermYears",
        "INVALID_TERM",
        "Loan term must be a whole number of years (1–40).",
      ),
    );
  }
  for (const [field, v] of [
    ["annualPropertyTax", inputs.annualPropertyTax],
    ["annualInsurance", inputs.annualInsurance],
    ["monthlyHOA", inputs.monthlyHOA],
  ] as const) {
    if (!num(v) || (v as number) < 0) {
      issues.push(issue(field, "INVALID_AMOUNT", `${field} can't be negative.`));
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the monthly cost breakdown and cash-to-close estimate for a
 * purchase. Mortgage-insurance rules are the Stage 3 configs (conventional
 * PMI 0.50%/yr below 20% down; FHA 1.75% upfront financed + 0.55%/yr; VA no
 * monthly MI, 2.15% funding fee financed) — reused, not duplicated.
 */
export function calculateMonthlyCost(
  inputs: MonthlyCostInputs,
): MonthlyCostOutcome {
  const validation = validateInputs(inputs);
  if (!validation.ok) return validation;

  const program: LoanProgram = LOAN_PROGRAMS[inputs.loanProgramId];
  const tier = getCreditTier(inputs.creditTierId);
  // Credit tier ONLY adjusts the illustrative rate — never multiplies
  // anything, never gates anything (same compliance rule as Stage 3).
  const tierAdj = tier?.rateAdjustmentPct ?? 0;
  const effectiveRatePct = Math.max(0, inputs.annualRatePct + tierAdj);

  const price = inputs.purchasePrice;
  const downPct =
    inputs.downPayment.mode === "percent"
      ? inputs.downPayment.pct / 100
      : price > 0
        ? Math.min(1, inputs.downPayment.amount / price)
        : 0;
  const downPaymentAmount =
    inputs.downPayment.mode === "percent"
      ? price * downPct
      : Math.min(inputs.downPayment.amount, price);

  const mi = program.mortgageInsurance;
  const upfront = mi.upfrontFinancedPct ?? 0;
  const baseLoan = Math.max(0, price - downPaymentAmount);
  const mortgageAmount = baseLoan * (1 + upfront);

  const pAndI = monthlyPayment(mortgageAmount, effectiveRatePct, inputs.loanTermYears);
  const tax = inputs.annualPropertyTax / 12;
  const ins = inputs.annualInsurance / 12;
  const hoa = inputs.monthlyHOA;
  const miApplies =
    mi.kind === "pmi"
      ? downPct < (mi.threshold ?? 0.2)
      : mi.kind === "fha-mip";
  const miMonthly = miApplies ? (mortgageAmount * (mi.annualRate ?? 0)) / 12 : 0;

  const monthly: MonthlyCostBreakdown = {
    principalAndInterest: round2(pAndI),
    propertyTax: round2(tax),
    insurance: round2(ins),
    hoa: round2(hoa),
    mortgageInsurance: round2(miMonthly),
    total: round2(pAndI + tax + ins + hoa + miMonthly),
  };

  // --- Closing costs (illustrative NYC model) ---
  const recordingTaxAmount = round2(recordingTax(mortgageAmount));
  const mansionRate = mansionTaxRate(price);
  const mansionTaxAmount = round2(mansionTax(price));
  const titleAmount = round2(price * TITLE_INSURANCE_PCT);
  const attorneyAmount = round2(ATTORNEY_FEE);
  // Illustrative "misc" plug for lender & third-party fees — origination,
  // underwriting/processing, appraisal, credit & flood reports — plus the home
  // inspection. Note: inspection and appraisal are typically paid out of
  // pocket BEFORE closing day, but they are still buyer costs. Calibrated so
  // total buyer closing costs land at ≈2.5% of price (MISC_CLOSING_TARGET_PCT);
  // $0 when the modeled lines already meet or exceed the benchmark.
  const miscAmount = round2(
    Math.max(
      0,
      price * MISC_CLOSING_TARGET_PCT -
        (recordingTaxAmount + mansionTaxAmount + titleAmount + attorneyAmount),
    ),
  );

  const closingCosts: ClosingCostLine[] = [
    {
      label: "Mortgage recording tax (borrower portion)",
      amount: recordingTaxAmount,
      source:
        "NYC MRT borrower-paid share: 1.80% of the loan under $500,000, 1.925% at $500,000+ (lender pays the other 0.25%) — NYS Tax Law; NYS Form MT-15, NYC Dept. of Finance.",
      illustrative: false,
    },
    ...(mansionRate !== null
      ? [
          {
            label: `Mansion tax (${(mansionRate * 100).toFixed(2)}% of full price)`,
            amount: mansionTaxAmount,
            source:
              "Buyer-paid; 1% statewide (NYS Tax Law §1402-a) + NYC graduated supplemental §1402-b: 1% at $1–2M … 3.90% at $25M+. Rate applies to the entire price, not just the amount over the threshold.",
            illustrative: false,
          } as ClosingCostLine,
        ]
      : []),
    {
      label: "Title insurance (illustrative)",
      amount: titleAmount,
      source:
        "Illustrative 0.45% of price — industry rule of thumb; actual premiums follow the NY-regulated TIRSA schedule and vary by insurer and endorsements.",
      illustrative: true,
    },
    {
      label: `Attorney fee (illustrative)`,
      amount: attorneyAmount,
      source: `Illustrative flat fee; typical NYC buyer range ${ATTORNEY_FEE_RANGE}.`,
      illustrative: true,
    },
    ...(miscAmount > 0
      ? [
          {
            label: "Lender & third-party fees (misc., illustrative)",
            amount: miscAmount,
            source:
              "Illustrative allowance for lender origination/underwriting/processing, appraisal, and credit/flood reports, plus the home inspection — inspection and appraisal are typically paid out of pocket BEFORE closing day. Calibrated so total buyer closing costs ≈ 2.5% of price, a commonly cited NYC benchmark; actual fees vary by lender.",
            illustrative: true,
          } as ClosingCostLine,
        ]
      : []),
  ];
  const closingCostsTotal = round2(
    closingCosts.reduce((s, l) => s + l.amount, 0),
  );
  const cashToClose = round2(downPaymentAmount + closingCostsTotal);

  const assumptions: string[] = [
    `Loan program: ${program.name} — ${program.source} (effective ${program.effectiveDate}).`,
    program.note,
    miApplies
      ? `Mortgage insurance (${program.name}): ${mi.description}`
      : `No monthly mortgage insurance (${program.name}).`,
    upfront > 0
      ? `${(upfront * 100).toFixed(2)}% one-time fee financed into the loan (raises the recorded loan amount and the recording tax base).`
      : undefined,
    tierAdj > 0
      ? `Credit tier adds +${tierAdj.toFixed(2)}% illustrative pricing adjustment (not a multiplier, not an approval factor).`
      : `No credit-tier adjustment applied${inputs.creditTierId ? "" : " (no range selected)"}.`,
    ...closingCosts.map((l) => `${l.label}: ${l.source}`),
    price < 1_000_000
      ? "No mansion tax below $1M."
      : undefined,
    miscAmount === 0
      ? "Closing costs already meet or exceed the illustrative 2.5%-of-price benchmark, so no misc. lender & third-party fee allowance was added."
      : undefined,
    "Closing-cost model assumes a condo/house purchase: co-op share loans record no real-property mortgage (no mortgage recording tax; UCC-1 filing instead).",
    "Co-op flip tax is building-specific and EXCLUDED from this estimate.",
    "The full closing-cost model is illustrative — actual fees vary by lender, attorney, and title company.",
    "Figures are estimates — not a loan approval or preapproval. Consult a licensed mortgage professional before making decisions.",
  ].filter((s): s is string => Boolean(s));

  return {
    ok: true,
    value: {
      purchasePrice: round2(price),
      downPaymentAmount: round2(downPaymentAmount),
      downPct,
      mortgageAmount: round2(mortgageAmount),
      effectiveRatePct,
      monthly,
      closingCosts,
      closingCostsTotal,
      cashToClose,
      mansionTaxRate: mansionRate,
      assumptions,
    },
  };
}
