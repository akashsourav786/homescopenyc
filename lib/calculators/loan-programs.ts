/**
 * Configurable loan-program rules for the Buyer Qualification Calculator.
 *
 * Every program carries `source` + `effectiveDate` metadata so the UI can
 * show where the numbers came from and how fresh they are. All caps, fees,
 * and insurance figures here are ILLUSTRATIVE — they approximate typical
 * program guidelines but are not lender quotes, and real qualification is
 * always set by the lender/underwriter.
 */

export type LoanProgramId = "conventional" | "fha" | "va";

export interface DtiCaps {
  /** Max housing-cost / gross-income ratio, e.g. 0.28. */
  front: number;
  /** Max all-debts / gross-income ratio, e.g. 0.36. */
  back: number;
}

/** Property types supported by the calculator. */
export type PropertyType = "single" | "two-unit" | "three-four-unit";

export const PROPERTY_TYPES: { id: PropertyType; label: string }[] = [
  { id: "single", label: "Single-family" },
  { id: "two-unit", label: "2-unit" },
  { id: "three-four-unit", label: "3–4 units" },
];

export function propertyTypeLabel(t: PropertyType): string {
  return PROPERTY_TYPES.find((p) => p.id === t)?.label ?? t;
}

/**
 * Illustrative haircut applied to user-entered rental income before it counts
 * toward qualifying income (vacancy/maintenance allowance).
 * Source: Fannie Mae rental-income guidelines use 75% of gross rents —
 * labeled illustrative; lenders verify with signed leases or an appraisal.
 */
export const RENTAL_INCOME_HAIRCUT = 0.75;

export interface MortgageInsuranceRule {
  kind: "pmi" | "fha-mip" | "none";
  /** Down-payment fraction below which monthly MI applies (PMI only). */
  threshold?: number;
  /**
   * Illustrative annual MI rate as a fraction of the loan amount
   * (e.g. 0.005 = 0.50%/yr), charged monthly while it applies.
   */
  annualRate?: number;
  /** One-time fee financed into the loan (fraction of loan), e.g. FHA upfront MIP. */
  upfrontFinancedPct?: number;
  /** Plain-language description shown in the assumptions panel. */
  description: string;
}

export interface LoanProgram {
  id: LoanProgramId;
  name: string;
  shortName: string;
  /** Minimum down payment for a single-family home, as a fraction (0.03 = 3%). */
  minDownPct: number;
  /** Minimum down payment by property type, as fractions (conforming LTV limits). */
  minDownPctByUnits: Record<PropertyType, number>;
  /** Standard ("higher" scenario) DTI caps. */
  dtiCaps: DtiCaps;
  /** Tighter caps used for the "conservative" scenario. */
  conservativeDtiCaps: DtiCaps;
  mortgageInsurance: MortgageInsuranceRule;
  /** Where these rules were sourced from (handbook / guide name). */
  source: string;
  /** When the sourced figures were last reviewed, YYYY-MM. */
  effectiveDate: string;
  /** Caveats shown alongside the program in the UI. */
  note: string;
}

export const LOAN_PROGRAMS: Record<LoanProgramId, LoanProgram> = {
  conventional: {
    id: "conventional",
    name: "Conventional",
    shortName: "Conv.",
    minDownPct: 0.03,
    minDownPctByUnits: {
      single: 0.03,
      "two-unit": 0.15,
      "three-four-unit": 0.25,
    },
    dtiCaps: { front: 0.45, back: 0.5 },
    conservativeDtiCaps: { front: 0.25, back: 0.33 },
    mortgageInsurance: {
      kind: "pmi",
      threshold: 0.2,
      annualRate: 0.005,
      description:
        "Illustrative private mortgage insurance (PMI) of 0.50%/yr of the loan amount, applied while the down payment is below 20% and removed at 80% loan-to-value. Actual PMI varies by lender, credit, and loan terms.",
    },
    source: "Fannie Mae Selling Guide — Desktop Underwriter (DU) maximums, illustrative",
    effectiveDate: "2026-10",
    note: "Caps reflect DU automated-underwriting maximums (up to 50% DTI with strong compensating factors such as excellent credit and reserves). Many lenders apply stricter overlays, often 45%. Unit-count minimum down payments follow conforming LTV limits (illustrative). Real qualification is set by the lender/underwriter.",
  },
  fha: {
    id: "fha",
    name: "FHA",
    shortName: "FHA",
    minDownPct: 0.035,
    minDownPctByUnits: {
      single: 0.035,
      "two-unit": 0.035,
      "three-four-unit": 0.035,
    },
    dtiCaps: { front: 0.47, back: 0.57 },
    conservativeDtiCaps: { front: 0.28, back: 0.4 },
    mortgageInsurance: {
      kind: "fha-mip",
      annualRate: 0.0055,
      upfrontFinancedPct: 0.0175,
      description:
        "Illustrative FHA mortgage insurance: 1.75% upfront MIP financed into the loan plus 0.55%/yr annual MIP on the loan amount. FHA MIP rules (including when it can drop) depend on the loan's down payment and term.",
    },
    source: "FHA Single Family Housing Policy Handbook 4000.1 + TOTAL Mortgage Scorecard maximums — illustrative",
    effectiveDate: "2026-10",
    note: "Caps reflect TOTAL Scorecard maximums (46.99%/56.99%) with AUS approval and compensating factors. Lenders apply overlays. FHA loans require lender approval and property eligibility — figures illustrative, verify current rules with a lender.",
  },
  va: {
    id: "va",
    name: "VA",
    shortName: "VA",
    minDownPct: 0,
    minDownPctByUnits: { single: 0, "two-unit": 0, "three-four-unit": 0 },
    // VA has no hard DTI maximum — 41% is the traditional guideline. The
    // "higher" caps reflect AUS approvals with strong residual income; the
    // residual-income test itself is not modeled (see note).
    dtiCaps: { front: 0.45, back: 0.5 },
    conservativeDtiCaps: { front: 0.38, back: 0.38 },
    mortgageInsurance: {
      kind: "none",
      upfrontFinancedPct: 0.0215,
      description:
        "No monthly mortgage insurance. Illustrative VA funding fee of 2.15% (first-use, no down payment) financed into the loan. Actual fee depends on service history, down payment, and prior VA loan use; some borrowers are exempt.",
    },
    source: "VA Lenders Handbook — illustrative",
    effectiveDate: "2026-10",
    note: "VA has no hard DTI maximum; 41% is the traditional guideline and higher ratios are approved with strong residual income. The VA residual-income test itself is not modeled here. For eligible veterans, service members, and qualifying spouses only.",
  },
};

export const LOAN_PROGRAM_LIST: LoanProgram[] = [
  LOAN_PROGRAMS.conventional,
  LOAN_PROGRAMS.fha,
  LOAN_PROGRAMS.va,
];

/**
 * Optional credit-score ranges. IMPORTANT DESIGN RULE (also enforced by tests
 * and documented in STAGE3_NOTES.md): a credit tier NEVER multiplies buying
 * power and NEVER gates approval. It only selects an illustrative interest-rate
 * pricing adjustment that is shown transparently in the assumptions panel.
 */
export interface CreditTier {
  id: string;
  label: string;
  /** Illustrative rate adjustment in percentage points added to the base rate. */
  rateAdjustmentPct: number;
  note: string;
}

export const CREDIT_TIERS: CreditTier[] = [
  {
    id: "excellent",
    label: "760+",
    rateAdjustmentPct: 0,
    note: "Best illustrative pricing tier — no adjustment.",
  },
  {
    id: "good",
    label: "700–759",
    rateAdjustmentPct: 0.25,
    note: "+0.25% illustrative pricing adjustment.",
  },
  {
    id: "fair",
    label: "640–699",
    rateAdjustmentPct: 0.5,
    note: "+0.50% illustrative pricing adjustment.",
  },
  {
    id: "low",
    label: "Below 640",
    rateAdjustmentPct: 0.75,
    note: "+0.75% illustrative pricing adjustment. Many loan programs have minimum score requirements — ask a lender.",
  },
];

export function getCreditTier(id: string | undefined): CreditTier | undefined {
  if (!id) return undefined;
  return CREDIT_TIERS.find((t) => t.id === id);
}

/** Minimum down payment for a program + property type, as a fraction. */
export function getMinDownPct(
  program: LoanProgram,
  propertyType: PropertyType,
): number {
  return program.minDownPctByUnits[propertyType] ?? program.minDownPct;
}
