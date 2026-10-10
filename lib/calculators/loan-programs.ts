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
  /** Minimum down payment, as a fraction (0.03 = 3%). */
  minDownPct: number;
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
    dtiCaps: { front: 0.28, back: 0.36 },
    conservativeDtiCaps: { front: 0.25, back: 0.33 },
    mortgageInsurance: {
      kind: "pmi",
      threshold: 0.2,
      annualRate: 0.005,
      description:
        "Illustrative private mortgage insurance (PMI) of 0.50%/yr of the loan amount, applied while the down payment is below 20% and removed at 80% loan-to-value. Actual PMI varies by lender, credit, and loan terms.",
    },
    source: "Fannie Mae Selling Guide — illustrative conforming guidelines",
    effectiveDate: "2024-06",
    note: "Illustrative caps only. Conforming-loan qualification is set by the lender and automated underwriting; individual results vary.",
  },
  fha: {
    id: "fha",
    name: "FHA",
    shortName: "FHA",
    minDownPct: 0.035,
    dtiCaps: { front: 0.31, back: 0.43 },
    conservativeDtiCaps: { front: 0.28, back: 0.4 },
    mortgageInsurance: {
      kind: "fha-mip",
      annualRate: 0.0055,
      upfrontFinancedPct: 0.0175,
      description:
        "Illustrative FHA mortgage insurance: 1.75% upfront MIP financed into the loan plus 0.55%/yr annual MIP on the loan amount. FHA MIP rules (including when it can drop) depend on the loan's down payment and term.",
    },
    source: "FHA Single Family Housing Policy Handbook 4000.1 — illustrative",
    effectiveDate: "2024-06",
    note: "FHA loans require lender approval and property eligibility. Figures here are illustrative — verify current MIP with a lender.",
  },
  va: {
    id: "va",
    name: "VA",
    shortName: "VA",
    minDownPct: 0,
    // VA guidelines center on residual income rather than a front-end ratio;
    // the 41% back-end figure is the commonly cited DTI guideline.
    dtiCaps: { front: 0.41, back: 0.41 },
    conservativeDtiCaps: { front: 0.38, back: 0.38 },
    mortgageInsurance: {
      kind: "none",
      upfrontFinancedPct: 0.0215,
      description:
        "No monthly mortgage insurance. Illustrative VA funding fee of 2.15% (first-use, no down payment) financed into the loan. Actual fee depends on service history, down payment, and prior VA loan use; some borrowers are exempt.",
    },
    source: "VA Lenders Handbook — illustrative",
    effectiveDate: "2024-06",
    note: "VA loans are for eligible veterans, service members, and qualifying spouses only. VA also applies a residual-income test not modeled here.",
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
