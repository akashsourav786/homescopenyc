/**
 * Buyer Qualification Calculator — pure calculation engine.
 *
 * Zero React imports: every function here is a pure function of its inputs,
 * which makes the math fully unit-testable (see buyer-qualification.test.ts).
 *
 * ## The math, in brief
 *
 * 1. **Monthly payment** — standard amortization:
 *    M = P · r(1+r)^n / ((1+r)^n − 1), with r = monthly rate, n = months.
 *    At 0% the payment is simply P / n.
 *
 * 2. **Housing budget from DTI** — two caps, the tighter one binds:
 *      front-end: maxHousing ≤ monthlyIncome × frontDTI
 *      back-end:  maxHousing ≤ monthlyIncome × backDTI − monthlyDebts
 *
 * 3. **Max price (closed form).** The total monthly housing cost is LINEAR in
 *    the purchase price P (P&I scales with the loan amount; tax, insurance and
 *    HOA are fixed user inputs), so instead of iterating we solve directly:
 *      monthlyCost(P) = P · k + c        →   P = (budget − c) / k
 *    where k is the per-dollar cost of the financed amount and c is the fixed
 *    monthly cost. The result is also capped by cash:
 *      cashToClose(P) = down(P) + P · closingCostPct ≤ savings.
 *    The binding constraint (front-end DTI, back-end DTI, or cash) is reported.
 *
 * 4. **Mortgage insurance** is program-specific (see loan-programs.ts) and is
 *    folded into k / the loan amount, never into the price itself.
 *
 * All figures are ESTIMATES. Nothing here is, or implies, a loan approval.
 */

import {
  CREDIT_TIERS,
  LOAN_PROGRAMS,
  RENTAL_INCOME_HAIRCUT,
  getMinDownPct,
  propertyTypeLabel,
  type LoanProgram,
  type LoanProgramId,
  type PropertyType,
} from "./loan-programs";

/** Re-exported so UI code can import all engine types from one place. */
export type { LoanProgramId, PropertyType };

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type DownPaymentInput =
  | { mode: "percent"; pct: number }
  | { mode: "amount"; amount: number };

export interface BuyerQualificationInputs {
  /** Gross annual household income, dollars. */
  annualIncome: number;
  /** Non-housing monthly debt obligations, dollars. */
  monthlyDebts: number;
  /** Cash available for the purchase, dollars. */
  savings: number;
  downPayment: DownPaymentInput;
  /** Optional credit-tier id (see CREDIT_TIERS). Never gates anything. */
  creditTierId?: string;
  loanProgramId: LoanProgramId;
  /** Base annual rate in percent (e.g. 6.5). Tier/buffer adjustments add on. */
  annualRatePct: number;
  loanTermYears: number;
  /** Annual property tax bill, dollars. */
  annualPropertyTax: number;
  /** Annual homeowners insurance premium, dollars. */
  annualInsurance: number;
  /** Monthly HOA / maintenance fees, dollars. */
  monthlyHOA: number;
  /** Estimated closing costs as a fraction of price (0.03 = 3%). */
  closingCostPct: number;
  /** Property type — multifamily unlocks rental-income qualifying. */
  propertyType: PropertyType;
  /**
   * User-entered monthly rental income from the other unit(s), dollars.
   * Only counted toward qualifying income for multifamily (after the
   * illustrative 75% haircut); ignored for single-family.
   */
  monthlyRentalIncome: number;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

export interface MonthlyBreakdown {
  principalAndInterest: number;
  propertyTax: number;
  insurance: number;
  hoa: number;
  mortgageInsurance: number;
  total: number;
}

export interface QualificationResult {
  /** Max affordable price, floored to the nearest $1,000. */
  maxPrice: number;
  downPaymentAmount: number;
  /** Loan amount actually financed (includes financed upfront MI/fees). */
  mortgageAmount: number;
  monthly: MonthlyBreakdown;
  closingCosts: number;
  cashToClose: number;
  /** Front/back-end DTI at the max price, as fractions (0.28 = 28%). */
  frontEndDTI: number;
  backEndDTI: number;
  /** The housing budget that bound the solve, $/mo. */
  allowedHousing: number;
  bindingConstraint: "front-end DTI" | "back-end DTI" | "cash available";
  /** Rate actually used, after tier adjustment and any scenario buffer. */
  effectiveRatePct: number;
  /** Gross monthly income used for DTI math (base + counted rental income). */
  effectiveMonthlyIncome: number;
  /** Monthly rental income counted (after the 75% haircut); 0 for single-family. */
  rentalIncomeCounted: number;
  /** Human-readable assumption lines for the UI assumptions panel. */
  assumptions: string[];
}

export type QualifyOutcome =
  | {
      ok: true;
      value: {
        conservative: QualificationResult;
        higher: QualificationResult;
        program: LoanProgram;
      };
    }
  | { ok: false; issues: ValidationIssue[] };

export interface SensitivityRow {
  label: string;
  change: string;
  newMaxPrice: number;
  /** newMaxPrice − baseline maxPrice (can be negative). */
  delta: number;
}

export type SensitivityOutcome =
  | { ok: true; baselineMaxPrice: number; rows: SensitivityRow[] }
  | { ok: false; issues: ValidationIssue[] };

/** Illustrative rate cushion added in the conservative scenario. */
export const CONSERVATIVE_RATE_BUFFER_PCT = 0.5;
/** NYC-typical default closing-cost assumption. */
export const DEFAULT_CLOSING_COST_PCT = 0.03;

/**
 * Monthly rental income actually counted toward qualifying income:
 * the illustrative 75% haircut (vacancy/maintenance allowance) applied to
 * user-entered rents, multifamily only. Single-family ignores the field.
 */
export function rentalIncomeCounted(
  inputs: BuyerQualificationInputs,
): number {
  if (inputs.propertyType === "single") return 0;
  const v = inputs.monthlyRentalIncome;
  if (!Number.isFinite(v) || v <= 0) return 0;
  return RENTAL_INCOME_HAIRCUT * v;
}

/**
 * Gross monthly income used for all DTI math: base income plus counted
 * rental income. This is what lenders do — qualifying income, not just
 * W-2 income.
 */
export function effectiveMonthlyIncome(
  inputs: BuyerQualificationInputs,
): number {
  return inputs.annualIncome / 12 + rentalIncomeCounted(inputs);
}

/* ------------------------------------------------------------------ */
/* 1. Monthly payment                                                  */
/* ------------------------------------------------------------------ */

/**
 * Standard amortized monthly payment.
 * @param principal loan amount in dollars
 * @param annualRatePct annual interest rate in percent (6.5 = 6.5%)
 * @param years loan term in years
 */
export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  years: number,
): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return (principal * r * factor) / (factor - 1);
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

export function validateInputs(
  inputs: BuyerQualificationInputs,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v);

  if (!num(inputs.annualIncome) || inputs.annualIncome <= 0) {
    issues.push(
      issue(
        "annualIncome",
        "INVALID_INCOME",
        "Annual income must be greater than $0.",
      ),
    );
  }
  if (!num(inputs.monthlyDebts) || inputs.monthlyDebts < 0) {
    issues.push(
      issue(
        "monthlyDebts",
        "INVALID_DEBTS",
        "Monthly debts can't be negative.",
      ),
    );
  }
  if (!num(inputs.savings) || inputs.savings < 0) {
    issues.push(
      issue("savings", "INVALID_SAVINGS", "Savings can't be negative."),
    );
  }

  if (
    inputs.propertyType !== "single" &&
    inputs.propertyType !== "two-unit" &&
    inputs.propertyType !== "three-four-unit"
  ) {
    issues.push(
      issue(
        "propertyType",
        "UNKNOWN_PROPERTY_TYPE",
        "Choose single-family, 2-unit, or 3–4 units.",
      ),
    );
  }
  if (
    !num(inputs.monthlyRentalIncome) ||
    inputs.monthlyRentalIncome < 0
  ) {
    issues.push(
      issue(
        "monthlyRentalIncome",
        "INVALID_RENTAL_INCOME",
        "Rental income can't be negative.",
      ),
    );
  }

  const program = LOAN_PROGRAMS[inputs.loanProgramId];
  if (!program) {
    issues.push(
      issue("loanProgramId", "UNKNOWN_PROGRAM", "Unknown loan program."),
    );
  } else {
    // Defensive: program DTI caps must be sane fractions.
    for (const [k, v] of Object.entries({
      front: program.dtiCaps.front,
      back: program.dtiCaps.back,
    })) {
      if (!(v > 0 && v <= 0.65)) {
        issues.push(
          issue(
            "loanProgramId",
            "INVALID_DTI_CAP",
            `Program ${k}-end DTI cap is out of range.`,
          ),
        );
      }
    }
    const minDown = getMinDownPct(program, inputs.propertyType);
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
            inputs.propertyType === "single"
              ? `${program.name} requires at least ${minDownLabel} down.`
              : `${program.name} requires at least ${minDownLabel} down on ${propertyTypeLabel(inputs.propertyType)} properties (illustrative).`,
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
      } else if (dp.amount > inputs.savings) {
        issues.push(
          issue(
            "downPayment",
            "DOWN_PAYMENT_EXCEEDS_SAVINGS",
            "Down payment can't exceed your available savings.",
          ),
        );
      }
    }
  }

  if (
    inputs.creditTierId !== undefined &&
    !CREDIT_TIERS.some((t) => t.id === inputs.creditTierId)
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
  if (
    !num(inputs.closingCostPct) ||
    inputs.closingCostPct < 0 ||
    inputs.closingCostPct > 0.1
  ) {
    issues.push(
      issue(
        "closingCostPct",
        "INVALID_CLOSING_COSTS",
        "Closing costs must be between 0% and 10% of the price.",
      ),
    );
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/* ------------------------------------------------------------------ */
/* Internal solve                                                      */
/* ------------------------------------------------------------------ */

interface SolveParams {
  frontDTI: number;
  backDTI: number;
  /** Extra illustrative rate cushion in percentage points (conservative). */
  rateBufferPct: number;
}

interface SolvedPrice {
  rawMaxPrice: number;
  bindingConstraint: QualificationResult["bindingConstraint"];
  allowedHousing: number;
}

/**
 * Closed-form max price. monthlyCost(P) = P·k + c is linear in P because
 * P&I scales with the financed amount while tax/insurance/HOA are fixed
 * inputs — so we solve P = (budget − c) / k directly instead of iterating.
 */
function solveMaxPrice(
  inputs: BuyerQualificationInputs,
  program: LoanProgram,
  params: SolveParams,
  tierAdjustmentPct: number,
): SolvedPrice {
  // DTI math runs on qualifying income: base income plus counted rental
  // income (multifamily only, after the illustrative 75% haircut).
  const monthlyIncome = effectiveMonthlyIncome(inputs);
  const effectiveRatePct = Math.max(
    0,
    inputs.annualRatePct + tierAdjustmentPct + params.rateBufferPct,
  );

  const frontBudget = monthlyIncome * params.frontDTI;
  const backBudget = monthlyIncome * params.backDTI - inputs.monthlyDebts;
  const allowedHousing = Math.max(0, Math.min(frontBudget, backBudget));
  const bindingDTI =
    frontBudget <= backBudget ? "front-end DTI" : "back-end DTI";

  // Payment per $1 of financed principal at the effective rate.
  const pmtPerDollar = monthlyPayment(1, effectiveRatePct, inputs.loanTermYears);
  const fixedMonthly =
    inputs.annualPropertyTax / 12 +
    inputs.annualInsurance / 12 +
    inputs.monthlyHOA;

  const mi = program.mortgageInsurance;
  const upfront = mi.upfrontFinancedPct ?? 0;
  // Per-dollar financed cost: P&I on the (possibly fee-loaded) loan + monthly MI.
  const financedFactor = (1 + upfront) * pmtPerDollar;

  let priceFromDTI: number;

  if (inputs.downPayment.mode === "percent") {
    const dp = inputs.downPayment.pct / 100;
    const miAnnual = mi.kind === "pmi" && dp < (mi.threshold ?? 1) ? (mi.annualRate ?? 0)
      : mi.kind === "fha-mip" ? (mi.annualRate ?? 0)
      : 0;
    // k: financed fraction × (P&I factor + monthly MI per financed dollar)
    const k = (1 - dp) * (financedFactor + miAnnual / 12);
    priceFromDTI = k > 0 ? (allowedHousing - fixedMonthly) / k : Infinity;
  } else {
    // Fixed down-payment amount: PMI turns on where downPct < 20%.
    // Solve both ways and keep the self-consistent one.
    const downAmt = inputs.downPayment.amount;
    const solveWith = (miAnnual: number) => {
      const k = financedFactor + miAnnual / 12;
      // monthlyCost(P) = (P − downAmt)·k + fixedMonthly
      return k > 0
        ? downAmt + (allowedHousing - fixedMonthly) / k
        : Infinity;
    };
    const pmiAnnual = mi.kind === "pmi" ? (mi.annualRate ?? 0) : 0;
    const fhaAnnual = mi.kind === "fha-mip" ? (mi.annualRate ?? 0) : 0;
    const noPmi = solveWith(fhaAnnual);
    if (
      mi.kind === "pmi" &&
      Number.isFinite(noPmi) &&
      noPmi > 0 &&
      downAmt / noPmi < (mi.threshold ?? 0.2)
    ) {
      priceFromDTI = solveWith(fhaAnnual + pmiAnnual);
    } else {
      priceFromDTI = noPmi;
    }
  }

  // Cash cap: down + price·closingCostPct ≤ savings.
  let priceFromCash: number;
  if (inputs.downPayment.mode === "percent") {
    const dp = inputs.downPayment.pct / 100;
    const denom = dp + inputs.closingCostPct;
    priceFromCash = denom > 0 ? inputs.savings / denom : Infinity;
  } else {
    priceFromCash =
      inputs.closingCostPct > 0
        ? (inputs.savings - inputs.downPayment.amount) / inputs.closingCostPct
        : Infinity;
  }

  let rawMax = Math.min(priceFromDTI, priceFromCash);
  if (!Number.isFinite(rawMax) || rawMax < 0) rawMax = 0;

  const bindingConstraint =
    priceFromCash < priceFromDTI ? "cash available" : bindingDTI;

  return { rawMaxPrice: rawMax, bindingConstraint, allowedHousing };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build the full result object for one solved price. */
function buildResult(
  inputs: BuyerQualificationInputs,
  program: LoanProgram,
  solved: SolvedPrice,
  tierAdjustmentPct: number,
  scenarioLabel: string,
  capsLabel: string,
): QualificationResult {
  const maxPrice = Math.floor(solved.rawMaxPrice / 1000) * 1000;
  const monthlyIncome = effectiveMonthlyIncome(inputs);
  const rentalCounted = rentalIncomeCounted(inputs);
  const minDownForUnits = getMinDownPct(program, inputs.propertyType);
  const effectiveRatePct = Math.max(
    0,
    inputs.annualRatePct + tierAdjustmentPct +
      (scenarioLabel === "conservative" ? CONSERVATIVE_RATE_BUFFER_PCT : 0),
  );

  const downPct =
    inputs.downPayment.mode === "percent"
      ? inputs.downPayment.pct / 100
      : maxPrice > 0
        ? Math.min(1, inputs.downPayment.amount / maxPrice)
        : 0;
  const downPaymentAmount =
    inputs.downPayment.mode === "percent"
      ? maxPrice * downPct
      : Math.min(inputs.downPayment.amount, maxPrice);

  const mi = program.mortgageInsurance;
  const upfront = mi.upfrontFinancedPct ?? 0;
  const baseLoan = Math.max(0, maxPrice - downPaymentAmount);
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

  const monthly: MonthlyBreakdown = {
    principalAndInterest: round2(pAndI),
    propertyTax: round2(tax),
    insurance: round2(ins),
    hoa: round2(hoa),
    mortgageInsurance: round2(miMonthly),
    total: round2(pAndI + tax + ins + hoa + miMonthly),
  };

  const closingCosts = round2(maxPrice * inputs.closingCostPct);
  const cashToClose = round2(downPaymentAmount + closingCosts);

  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const assumptions: string[] = [
    `Scenario: ${scenarioLabel} — DTI caps ${capsLabel}, rate ${effectiveRatePct.toFixed(2)}%.`,
    tierAdjustmentPct > 0
      ? `Credit tier adds +${tierAdjustmentPct.toFixed(2)}% illustrative pricing adjustment (not a multiplier, not an approval factor).`
      : `No credit-tier adjustment applied${inputs.creditTierId ? "" : " (no range selected)"}.`,
    `Property type: ${propertyTypeLabel(inputs.propertyType)}.`,
    rentalCounted > 0
      ? `Rental income counted: 75% × ${money(inputs.monthlyRentalIncome)}/mo = ${money(rentalCounted)}/mo toward qualifying income (illustrative; lenders verify with signed leases or an appraisal).`
      : undefined,
    `Minimum down for ${program.name} on ${propertyTypeLabel(inputs.propertyType)}: ${(minDownForUnits * 100).toFixed(1)}% (illustrative).`,
    miApplies
      ? `Mortgage insurance (${program.name}): ${mi.description}`
      : `No monthly mortgage insurance (${program.name}).`,
    upfront > 0
      ? `${(upfront * 100).toFixed(2)}% one-time fee financed into the loan.`
      : undefined,
    `Closing costs estimated at ${(inputs.closingCostPct * 100).toFixed(1)}% of price (NYC-typical default 3%).`,
    `Loan program rules: ${program.source} (effective ${program.effectiveDate}). ${program.note}`,
    "Max price floored to the nearest $1,000. Figures are estimates, not a loan approval.",
  ].filter((s): s is string => Boolean(s));

  return {
    maxPrice,
    downPaymentAmount: round2(downPaymentAmount),
    mortgageAmount: round2(mortgageAmount),
    monthly,
    closingCosts,
    cashToClose,
    frontEndDTI: monthlyIncome > 0 ? monthly.total / monthlyIncome : 0,
    backEndDTI:
      monthlyIncome > 0
        ? (monthly.total + inputs.monthlyDebts) / monthlyIncome
        : 0,
    allowedHousing: round2(solved.allowedHousing),
    bindingConstraint: solved.bindingConstraint,
    effectiveRatePct,
    effectiveMonthlyIncome: round2(monthlyIncome),
    rentalIncomeCounted: round2(rentalCounted),
    assumptions,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Run the full qualification: validate, then solve the conservative and
 * higher scenarios. The affordable "range" shown in the UI is
 * [conservative.maxPrice, higher.maxPrice].
 */
export function qualifyBuyer(
  inputs: BuyerQualificationInputs,
): QualifyOutcome {
  const validation = validateInputs(inputs);
  if (!validation.ok) return validation;

  const program = LOAN_PROGRAMS[inputs.loanProgramId];
  const tier = inputs.creditTierId
    ? CREDIT_TIERS.find((t) => t.id === inputs.creditTierId)
    : undefined;
  const tierAdj = tier?.rateAdjustmentPct ?? 0;

  const conservativeParams: SolveParams = {
    frontDTI: program.conservativeDtiCaps.front,
    backDTI: program.conservativeDtiCaps.back,
    rateBufferPct: CONSERVATIVE_RATE_BUFFER_PCT,
  };
  const higherParams: SolveParams = {
    frontDTI: program.dtiCaps.front,
    backDTI: program.dtiCaps.back,
    rateBufferPct: 0,
  };

  const caps = (p: SolveParams) =>
    `${Math.round(p.frontDTI * 100)}/${Math.round(p.backDTI * 100)}`;

  const conservative = buildResult(
    inputs,
    program,
    solveMaxPrice(inputs, program, conservativeParams, tierAdj),
    tierAdj,
    "conservative",
    caps(conservativeParams),
  );
  const higher = buildResult(
    inputs,
    program,
    solveMaxPrice(inputs, program, higherParams, tierAdj),
    tierAdj,
    "higher",
    caps(higherParams),
  );

  // Amount-mode down payments can't be checked against the program minimum
  // until we know the price — check it here against the solved result,
  // using the unit-count-adjusted minimum.
  if (inputs.downPayment.mode === "amount" && higher.maxPrice > 0) {
    const effectivePct = higher.downPaymentAmount / higher.maxPrice;
    const minDown = getMinDownPct(program, inputs.propertyType);
    if (effectivePct < minDown - 1e-9) {
      return {
        ok: false,
        issues: [
          {
            field: "downPayment",
            code: "BELOW_PROGRAM_MINIMUM",
            message:
              inputs.propertyType === "single"
                ? `This down payment is below the ${program.name} minimum of ${(
                    minDown * 100
                  ).toFixed(1)}% at the estimated price. Increase the down payment or savings.`
                : `This down payment is below the ${program.name} minimum of ${(
                    minDown * 100
                  ).toFixed(1)}% for ${propertyTypeLabel(inputs.propertyType)} properties at the estimated price (illustrative). Increase the down payment or savings.`,
          },
        ],
      };
    }
  }

  return { ok: true, value: { conservative, higher, program } };
}

/**
 * "What-if" analysis: recompute the higher-scenario max price while varying
 * one factor at a time. Pure function of the engine.
 */
export function sensitivity(
  inputs: BuyerQualificationInputs,
): SensitivityOutcome {
  const base = qualifyBuyer(inputs);
  if (!base.ok) return base;
  const baseline = base.value.higher.maxPrice;

  // Normalize down payment to percent-mode at the baseline price so the
  // ±5pt variation is well-defined regardless of input mode.
  const baseDownPct =
    inputs.downPayment.mode === "percent"
      ? inputs.downPayment.pct
      : baseline > 0
        ? (inputs.downPayment.amount / baseline) * 100
        : 0;
  const pctInputs: BuyerQualificationInputs = {
    ...inputs,
    downPayment: { mode: "percent", pct: baseDownPct },
  };

  const variants: { label: string; change: string; mutate: (i: BuyerQualificationInputs) => void }[] = [
    {
      label: "Interest rate",
      change: "+1%",
      mutate: (i) => { i.annualRatePct = Math.min(25, i.annualRatePct + 1); },
    },
    {
      label: "Interest rate",
      change: "−1%",
      mutate: (i) => { i.annualRatePct = Math.max(0, i.annualRatePct - 1); },
    },
    {
      label: "Down payment",
      change: "+5 pts",
      mutate: (i) => {
        if (i.downPayment.mode === "percent")
          i.downPayment = { mode: "percent", pct: Math.min(100, i.downPayment.pct + 5) };
      },
    },
    {
      label: "Down payment",
      change: "−5 pts",
      mutate: (i) => {
        if (i.downPayment.mode === "percent")
          i.downPayment = { mode: "percent", pct: Math.max(0, i.downPayment.pct - 5) };
      },
    },
    {
      label: "Monthly debts",
      change: "+$500",
      mutate: (i) => { i.monthlyDebts = i.monthlyDebts + 500; },
    },
    {
      label: "Monthly debts",
      change: "−$500",
      mutate: (i) => { i.monthlyDebts = Math.max(0, i.monthlyDebts - 500); },
    },
    {
      label: "Savings",
      change: "+$25k",
      mutate: (i) => { i.savings = i.savings + 25000; },
    },
    {
      label: "Savings",
      change: "−$25k",
      mutate: (i) => { i.savings = Math.max(0, i.savings - 25000); },
    },
  ];

  const rows: SensitivityRow[] = [];
  for (const v of variants) {
    // Deep-clone the (normalized) inputs, apply one change, re-solve.
    const copy: BuyerQualificationInputs = {
      ...pctInputs,
      downPayment: { ...pctInputs.downPayment } as DownPaymentInput,
    };
    v.mutate(copy);
    const out = qualifyBuyer(copy);
    if (!out.ok) continue; // e.g. down payment pushed below program minimum
    const newMaxPrice = out.value.higher.maxPrice;
    rows.push({
      label: v.label,
      change: v.change,
      newMaxPrice,
      delta: newMaxPrice - baseline,
    });
  }

  return { ok: true, baselineMaxPrice: baseline, rows };
}
