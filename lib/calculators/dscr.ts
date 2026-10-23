/**
 * DSCR (Debt Service Coverage Ratio) Calculator — pure calculation engine.
 *
 * Zero React imports: every function here is a pure function of its inputs,
 * which makes the math fully unit-testable (see dscr.test.ts).
 *
 * ## How a DSCR loan qualifies (and how this engine models it)
 *
 * A DSCR loan underwrites the PROPERTY, not the borrower: no personal
 * income, no DTI. The lender asks whether the property's gross rent covers
 * its full monthly housing cost (PITIA):
 *
 *     DSCR = gross monthly rent / monthly PITIA
 *
 * This engine runs the sizing in the direction a buyer actually shops —
 * from the rent to the maximum price it can carry:
 *
 *     max PITIA  = gross monthly rent / target DSCR
 *     max P&I    = max PITIA − taxes − insurance − HOA   (all $/mo inputs)
 *     max loan   = max P&I converted through the amortization factor
 *     max price  = max loan + cash down payment
 *                  (or max loan / (1 − down%) in percent mode)
 *
 * DESIGN RULE (product decision, 2026-10): there is exactly ONE sizing
 * path — the rent. Lender LTV / credit-band caps are shown as GUIDANCE
 * NOTES only and never reduce the computed price. The classic two-ceiling
 * "lower of" model was deliberately rejected: at the 25–30% down payments
 * typical of DSCR approvals the lender cap rarely binds, and capping the
 * headline number understates what buyers actually get qualified for.
 *
 * All figures are ESTIMATES based on ILLUSTRATIVE published guidelines.
 * Nothing here is, or implies, a loan approval or a lender quote.
 */

import {
  monthlyPayment,
  type DownPaymentInput,
  type ValidationIssue,
  type ValidationResult,
} from "./buyer-qualification";
import {
  ATTORNEY_FEE,
  ATTORNEY_FEE_RANGE,
  TITLE_INSURANCE_PCT,
  mansionTax,
  recordingTax,
} from "./monthly-cost";

/** Re-exported so UI code can import all engine types from one place. */
export type { DownPaymentInput, ValidationIssue, ValidationResult };

/* ------------------------------------------------------------------ */
/* Rules / config (loan-programs.ts style: sourced, dated, illustrative) */
/* ------------------------------------------------------------------ */

/**
 * DSCR guideline snapshot. Every figure is ILLUSTRATIVE — it approximates
 * typical published DSCR lender guidelines but is not a lender quote, and
 * real qualification is always set by the lender/underwriter.
 */
export const DSCR_RULES = {
  /** Ratio ladder shown side by side; the user picks one as primary. */
  ratioLadder: [1.0, 1.1, 1.25] as readonly number[],
  /** Default primary target — the most common approval floor. */
  defaultTargetDscr: 1.0,
  /**
   * Below this ratio, standard programs generally stop; a small set of
   * specialty / "no-ratio" programs still lend (see guidance notes).
   */
  subOneFloor: 0.75,
  /** Illustrative default rate assumption (user-editable). */
  defaultRatePct: 7.75,
  defaultTermYears: 30,
  /**
   * Typical max LTV on standard programs (DSCR ≥ 1.00). GUIDANCE ONLY —
   * never applied as a cap in this engine (see the design rule above).
   */
  standardMaxLtv: 0.8,
  source:
    "Published DSCR lender guideline matrices (Lima One, Visio Lending, RCN Capital, Deephaven) — illustrative",
  effectiveDate: "2026-10",
} as const;

/**
 * Credit-band / LTV guidance shown with the results. These describe how
 * lenders typically gate leverage — they are NOT applied to the math.
 */
export const DSCR_GUIDANCE_NOTES: string[] = [
  "Standard DSCR programs typically cap the loan at 80% of the price (20% down) at a 1.00 ratio or better for top credit tiers, stepping down as credit or loan size weakens.",
  "Below a 1.00 ratio, approvals generally need 700+ credit and 75% LTV or less; the practical floor on most published matrices is a 0.75 ratio, with specialty no-ratio programs below that.",
  "Most DSCR approvals land at 25–30% down — the rent, not the lender's cap, is usually what sizes the loan.",
  "Lenders qualify rent at the lesser of the signed lease and the appraiser's market rent (Form 1007), and re-assess taxes at the purchase price — both can lower the ratio after application.",
];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DscrInputs {
  /** Gross monthly rent for the whole property, dollars. */
  monthlyRent: number;
  /** Monthly property taxes, dollars (NOT annual). */
  monthlyTaxes: number;
  /** Monthly homeowners insurance, dollars (NOT annual). */
  monthlyInsurance: number;
  /** Monthly HOA / association dues, dollars. */
  monthlyHOA: number;
  /**
   * Down payment: { mode: "amount" } = cash dollars available (primary),
   * { mode: "percent" } = percent of the solved price.
   */
  downPayment: DownPaymentInput;
  /** Annual interest rate in percent (e.g. 7.75). */
  annualRatePct: number;
  /** Loan term in whole years. */
  loanTermYears: number;
  /** Primary target DSCR — one of DSCR_RULES.ratioLadder. */
  targetDscr: number;
}

export interface DscrClosingLine {
  label: string;
  amount: number;
}

export interface DscrScenarioResult {
  /** The DSCR this scenario is sized at. */
  targetDscr: number;
  /** rent / targetDscr — the total monthly housing cost the rent carries. */
  maxPitia: number;
  /** P&I portion of maxPitia after taxes/insurance/HOA. */
  maxPrincipalAndInterest: number;
  /** Loan amount at the max price, dollars. */
  maxLoan: number;
  /** Max purchase price, floored to the nearest $1,000. */
  maxPrice: number;
  downPaymentAmount: number;
  /** Implied down payment as a fraction of maxPrice (0.25 = 25%). */
  downPaymentPct: number;
  /** PITIA at the solved price (recomputed from the floored price). */
  monthly: {
    principalAndInterest: number;
    propertyTax: number;
    insurance: number;
    hoa: number;
    total: number;
  };
  /** Itemized NYC closing-cost estimate at the max price (illustrative). */
  closingLines: DscrClosingLine[];
  closingCostsTotal: number;
  /** Down payment + closing costs at the max price. */
  cashToClose: number;
  /** Human-readable assumption lines for the UI assumptions panel. */
  assumptions: string[];
}

export interface DscrResult {
  /** One result per ladder ratio, in ladder order. */
  scenarios: DscrScenarioResult[];
  /** The scenario matching inputs.targetDscr. */
  selected: DscrScenarioResult;
}

export type DscrOutcome =
  | { ok: true; value: DscrResult }
  | { ok: false; issues: ValidationIssue[] };

/* ------------------------------------------------------------------ */
/* Payment ↔ loan conversion                                           */
/* ------------------------------------------------------------------ */

/**
 * Largest loan whose amortized monthly P&I equals `monthlyPI`.
 * Derived from monthlyPayment() (payment per $1 of principal), so the two
 * directions can never drift apart. At 0% this is simply P&I × months.
 */
export function loanFromMonthlyPayment(
  monthlyPI: number,
  annualRatePct: number,
  years: number,
): number {
  if (!Number.isFinite(monthlyPI) || monthlyPI <= 0) return 0;
  const perDollar = monthlyPayment(1, annualRatePct, years);
  if (!(perDollar > 0)) return 0;
  return monthlyPI / perDollar;
}

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

export function validateDscrInputs(inputs: DscrInputs): ValidationResult {
  const issues: ValidationIssue[] = [];
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

  if (!num(inputs.monthlyRent) || inputs.monthlyRent <= 0) {
    issues.push(
      issue(
        "monthlyRent",
        "INVALID_RENT",
        "Monthly rent must be greater than $0.",
      ),
    );
  }
  for (const [field, v] of [
    ["monthlyTaxes", inputs.monthlyTaxes],
    ["monthlyInsurance", inputs.monthlyInsurance],
    ["monthlyHOA", inputs.monthlyHOA],
  ] as const) {
    if (!num(v) || (v as number) < 0) {
      issues.push(issue(field, "INVALID_AMOUNT", `${field} can't be negative.`));
    }
  }

  const dp = inputs.downPayment;
  if (dp.mode === "percent") {
    if (!num(dp.pct) || dp.pct < 0 || dp.pct >= 100) {
      issues.push(
        issue(
          "downPayment",
          "INVALID_DOWN_PAYMENT",
          "Down payment percent must be at least 0% and under 100% — at 100% down there is no loan for the rent to size.",
        ),
      );
    }
  } else if (!num(dp.amount) || dp.amount < 0) {
    issues.push(
      issue(
        "downPayment",
        "INVALID_DOWN_PAYMENT",
        "Down payment can't be negative.",
      ),
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
  if (
    !num(inputs.targetDscr) ||
    !DSCR_RULES.ratioLadder.some((r) => Math.abs(r - inputs.targetDscr) < 1e-9)
  ) {
    issues.push(
      issue(
        "targetDscr",
        "INVALID_TARGET_DSCR",
        `Target DSCR must be one of ${DSCR_RULES.ratioLadder
          .map((r) => r.toFixed(2))
          .join(", ")}.`,
      ),
    );
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildScenario(
  inputs: DscrInputs,
  targetDscr: number,
): DscrScenarioResult {
  const fixedMonthly =
    inputs.monthlyTaxes + inputs.monthlyInsurance + inputs.monthlyHOA;

  const maxPitia = inputs.monthlyRent / targetDscr;
  const maxPI = maxPitia - fixedMonthly;
  const rawLoan = loanFromMonthlyPayment(
    maxPI,
    inputs.annualRatePct,
    inputs.loanTermYears,
  );

  const rawPrice =
    inputs.downPayment.mode === "amount"
      ? rawLoan + inputs.downPayment.amount
      : rawLoan / (1 - inputs.downPayment.pct / 100);

  // Same reporting convention as the income engine: floor to $1,000, then
  // derive loan/down from the floored price so the result is consistent
  // (price = loan + down) in the UI.
  const maxPrice =
    Number.isFinite(rawPrice) && rawPrice > 0
      ? Math.floor(rawPrice / 1000) * 1000
      : 0;
  const downPaymentAmount =
    inputs.downPayment.mode === "amount"
      ? Math.min(inputs.downPayment.amount, maxPrice)
      : maxPrice * (inputs.downPayment.pct / 100);
  const maxLoan = Math.max(0, maxPrice - downPaymentAmount);
  const downPaymentPct = maxPrice > 0 ? downPaymentAmount / maxPrice : 0;

  const pAndI = monthlyPayment(
    maxLoan,
    inputs.annualRatePct,
    inputs.loanTermYears,
  );
  const monthly = {
    principalAndInterest: round2(pAndI),
    propertyTax: round2(inputs.monthlyTaxes),
    insurance: round2(inputs.monthlyInsurance),
    hoa: round2(inputs.monthlyHOA),
    total: round2(
      pAndI + inputs.monthlyTaxes + inputs.monthlyInsurance + inputs.monthlyHOA,
    ),
  };

  // NYC closing-cost estimate — reuses the True Monthly Cost model
  // (monthly-cost.ts): borrower-paid mortgage recording tax on the loan,
  // graduated mansion tax on the price, title insurance % of price, flat
  // attorney fee. Lender/third-party fees are NOT itemized here.
  const mrt = recordingTax(maxLoan);
  const mansion = mansionTax(maxPrice);
  const title = maxPrice * TITLE_INSURANCE_PCT;
  const closingLines: DscrClosingLine[] = [
    { label: "Mortgage recording tax (borrower share)", amount: round2(mrt) },
    ...(mansion > 0
      ? [{ label: "Mansion tax", amount: round2(mansion) }]
      : []),
    {
      label: `Title insurance (~${(TITLE_INSURANCE_PCT * 100).toFixed(2)}% of price)`,
      amount: round2(title),
    },
    {
      label: `Attorney fee (typical ${ATTORNEY_FEE_RANGE})`,
      amount: round2(ATTORNEY_FEE),
    },
  ];
  const closingCostsTotal = round2(
    closingLines.reduce((sum, l) => sum + l.amount, 0),
  );
  const cashToClose = round2(downPaymentAmount + closingCostsTotal);

  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const assumptions: string[] = [
    `Sized at a ${targetDscr.toFixed(2)} DSCR: ${money(inputs.monthlyRent)}/mo gross rent ÷ ${targetDscr.toFixed(2)} = ${money(maxPitia)}/mo maximum PITIA.`,
    `Taxes, insurance, and HOA are the dollar amounts you entered (${money(fixedMonthly)}/mo combined) — they are never estimated as a percent of PITIA.`,
    `Rate ${inputs.annualRatePct.toFixed(2)}%, ${inputs.loanTermYears}-year term. No interest-only sizing in this version.`,
    inputs.downPayment.mode === "amount"
      ? `Price = rent-sized loan + your ${money(inputs.downPayment.amount)} cash down payment.`
      : `Price = rent-sized loan ÷ (1 − ${inputs.downPayment.pct}% down).`,
    "The loan is sized by the rent alone. Lender LTV/credit caps are shown as guidance and do NOT reduce this price (see guidance notes).",
    `Closing costs itemize NYC mortgage recording tax (borrower share), mansion tax at $1M+, title insurance, and an attorney fee — the same model as True Monthly Cost. Lender and third-party fees are not itemized, so actual cash to close will be higher.`,
    `DSCR guidelines: ${DSCR_RULES.source} (effective ${DSCR_RULES.effectiveDate}). All figures are illustrative estimates, not lender quotes or a loan approval.`,
    "Max price floored to the nearest $1,000.",
  ];
  if (maxPI <= 0) {
    assumptions.unshift(
      "At this target, taxes + insurance + HOA alone meet or exceed what the rent can carry — no loan sizes at this ratio. Lower the target DSCR or the monthly costs to see a number.",
    );
  }

  return {
    targetDscr,
    maxPitia: round2(maxPitia),
    maxPrincipalAndInterest: round2(Math.max(0, maxPI)),
    maxLoan: round2(maxLoan),
    maxPrice,
    downPaymentAmount: round2(downPaymentAmount),
    downPaymentPct,
    monthly,
    closingLines,
    closingCostsTotal,
    cashToClose,
    assumptions,
  };
}

/**
 * Size a DSCR purchase from the property's rent: validate, then compute
 * the full ratio ladder (1.00 / 1.10 / 1.25) and mark the selected target.
 */
export function qualifyDscr(inputs: DscrInputs): DscrOutcome {
  const validation = validateDscrInputs(inputs);
  if (!validation.ok) return validation;

  const scenarios = DSCR_RULES.ratioLadder.map((r) =>
    buildScenario(inputs, r),
  );
  const selected =
    scenarios.find(
      (s) => Math.abs(s.targetDscr - inputs.targetDscr) < 1e-9,
    ) ?? scenarios[0];

  return { ok: true, value: { scenarios, selected } };
}
