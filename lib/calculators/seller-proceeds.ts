/**
 * Seller Net Proceeds Calculator — pure calculation engine.
 *
 * Zero React imports: every function here is a pure function of its inputs,
 * which makes the math fully unit-testable (see seller-proceeds.test.ts).
 *
 * ## The math, in brief
 *
 * Net proceeds = sale price − Σ deductions, where the deductions are:
 *
 *   1. Mortgage payoff(s): first mortgage + optional second mortgage / HELOC
 *      balance, exactly as entered.
 *   2. Broker commission: sale price × commissionPct. This is a percentage of
 *      the GROSS price, not of equity. The 6% default is illustrative —
 *      commission is negotiable.
 *   3. NYC Real Property Transfer Tax (RPTT), residential rate (1–3 family
 *      houses, individual condo units, individual co-op apartments):
 *        consideration ≤ $500,000 → 1% of consideration
 *        consideration  > $500,000 → 1.425% of consideration
 *      The higher rate applies to the FULL price, not a marginal bracket —
 *      a $1,000,000 sale owes $14,250. Source: NYC Dept. of Finance RPTT
 *      page and 2024 RPTT report tax-rate tables (verified Oct 2026).
 *   4. NYS transfer tax: 0.4% ($4 per $1,000) of the price when the
 *      consideration exceeds $500, paid by the seller (grantor). Source: NYC
 *      Dept. of Finance RPTT tax-rate tables (verified Oct 2026).
 *   5. Seller concessions, attorney fee, and other seller costs: passed
 *      through exactly as entered.
 *
 * All amounts are rounded to whole dollars. Net proceeds can be NEGATIVE —
 * that means the seller would need to bring cash to closing, and the UI
 * must say so plainly.
 *
 * ## Deliberate omissions (documented, not forgotten)
 *
 * - **Capital-gains tax is excluded.** No flat formula can estimate it: it
 *   depends on holding period, cost basis, and the primary-residence
 *   exclusion. The UI says this and points to a CPA.
 * - **NYS additional/supplemental transfer taxes** for NYC residential sales
 *   of $3M or more (0.25% additional base tax plus 0.25%–2.9% supplemental
 *   tax): not modeled. This estimate understates taxes above that threshold,
 *   and an assumption line says so.
 * - **Co-op flip taxes, building transfer fees, mansion tax** (buyer-paid
 *   anyway): covered by the free-form "other seller costs" field instead.
 * - **Prorated taxes / HOA and mortgage interest accrued to closing day:**
 *   timing details the seller's attorney computes from the actual closing
 *   date.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SellerProceedsInputs {
  /** Expected sale price, dollars. */
  salePrice: number;
  /** Remaining first-mortgage payoff balance, dollars. */
  firstMortgageBalance: number;
  /** Remaining second mortgage / HELOC payoff balance, dollars (0 if none). */
  secondMortgageBalance: number;
  /**
   * Broker commission in percent (e.g. 6 = 6%). Illustrative and negotiable —
   * it is a percentage of the gross sale price, not of equity.
   */
  commissionPct: number;
  /** Credits to the buyer agreed in the contract, dollars. */
  sellerConcessions: number;
  /** Seller's attorney fee, dollars. */
  attorneyFee: number;
  /** Other seller closing costs (flip tax, building fees, …), dollars. */
  otherSellerCosts: number;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

/** One line of the deduction waterfall. Amounts are whole dollars, ≥ 0. */
export interface DeductionLine {
  label: string;
  amount: number;
  note?: string;
}

export interface SellerProceedsResult {
  /** Sale price, whole dollars. */
  salePrice: number;
  /** Itemized deductions, in display order. */
  deductions: DeductionLine[];
  totalDeductions: number;
  /**
   * Sale price minus all deductions. Can be NEGATIVE — the seller would
   * need to bring cash to closing.
   */
  netProceeds: number;
  /** Sale price minus mortgage payoffs, before other selling costs. */
  equityBeforeCosts: number;
  /** Human-readable assumption lines for the UI assumptions panel. */
  assumptions: string[];
}

export type EstimateOutcome =
  | { ok: true; value: SellerProceedsResult }
  | { ok: false; issues: ValidationIssue[] };

/* ------------------------------------------------------------------ */
/* Transfer-tax constants (verified Oct 2026)                          */
/* ------------------------------------------------------------------ */

/**
 * NYC Real Property Transfer Tax, residential rate — 1–3 family houses,
 * individual condo units, individual co-op apartments: 1% of the
 * consideration when it is $500,000 or less.
 */
export const NYC_RPTT_LOW_RATE = 0.01;
/**
 * NYC RPTT residential rate when the consideration EXCEEDS $500,000: 1.425%
 * of the FULL price (not a marginal bracket — $1M owes $14,250).
 */
export const NYC_RPTT_HIGH_RATE = 0.01425;
/** The consideration threshold that selects the NYC RPTT rate. */
export const NYC_RPTT_THRESHOLD = 500_000;
/**
 * NYS transfer tax: 0.4% ($4 per $1,000, $2 per $500) of the consideration
 * when it exceeds $500. Paid by the seller (grantor).
 */
export const NYS_TRANSFER_TAX_RATE = 0.004;
export const NYS_TRANSFER_TAX_MIN_CONSIDERATION = 500;

export const NYC_RPTT_SOURCE =
  "NYC Department of Finance — Real Property Transfer Tax page (nyc.gov) and 2024 RPTT report tax-rate tables";
export const NYS_TRANSFER_TAX_SOURCE =
  "NYC Department of Finance — 2024 RPTT report tax-rate tables (NYS Levy 0.4%)";

/**
 * Illustrative NYC default commission. Commission is NEGOTIABLE — this is a
 * starting placeholder, not a rule or a requirement.
 */
export const DEFAULT_COMMISSION_PCT = 6;
/** Typical NYC seller attorney fee, used as the form default. */
export const DEFAULT_ATTORNEY_FEE = 2500;

/* ------------------------------------------------------------------ */
/* Transfer-tax math                                                   */
/* ------------------------------------------------------------------ */

/**
 * NYC transfer tax (RPTT) on a residential sale: 1% at $500,000 or less,
 * 1.425% of the full price above $500,000. Rounded to the dollar.
 */
export function nycTransferTax(salePrice: number): number {
  if (!Number.isFinite(salePrice) || salePrice <= 0) return 0;
  const rate =
    salePrice <= NYC_RPTT_THRESHOLD ? NYC_RPTT_LOW_RATE : NYC_RPTT_HIGH_RATE;
  return Math.round(salePrice * rate);
}

/**
 * NYS transfer tax on a sale: 0.4% of the price when the consideration
 * exceeds $500. Rounded to the dollar. The additional / supplemental taxes
 * for NYC residential sales of $3M+ are deliberately not modeled.
 */
export function nysTransferTax(salePrice: number): number {
  if (
    !Number.isFinite(salePrice) ||
    salePrice <= NYS_TRANSFER_TAX_MIN_CONSIDERATION
  )
    return 0;
  return Math.round(salePrice * NYS_TRANSFER_TAX_RATE);
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
  inputs: SellerProceedsInputs,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v);

  if (!num(inputs.salePrice) || inputs.salePrice <= 0) {
    issues.push(
      issue(
        "salePrice",
        "INVALID_SALE_PRICE",
        "Sale price must be greater than $0.",
      ),
    );
  }
  if (!num(inputs.firstMortgageBalance) || inputs.firstMortgageBalance < 0) {
    issues.push(
      issue(
        "firstMortgageBalance",
        "INVALID_MORTGAGE_BALANCE",
        "First mortgage balance can't be negative — enter 0 if you own the home free and clear.",
      ),
    );
  }
  if (!num(inputs.secondMortgageBalance) || inputs.secondMortgageBalance < 0) {
    issues.push(
      issue(
        "secondMortgageBalance",
        "INVALID_MORTGAGE_BALANCE",
        "Second mortgage / HELOC balance can't be negative — enter 0 if you don't have one.",
      ),
    );
  }
  if (
    !num(inputs.commissionPct) ||
    inputs.commissionPct < 0 ||
    inputs.commissionPct > 100
  ) {
    issues.push(
      issue(
        "commissionPct",
        "INVALID_COMMISSION",
        "Commission must be between 0% and 100%. It is negotiable — enter whatever you and your agent agree on.",
      ),
    );
  }
  for (const [field, label] of [
    ["sellerConcessions", "Seller concessions"],
    ["attorneyFee", "Attorney fee"],
    ["otherSellerCosts", "Other seller costs"],
  ] as const) {
    const v = inputs[field];
    if (!num(v) || v < 0) {
      issues.push(
        issue(
          field,
          "INVALID_AMOUNT",
          `${label} can't be negative — enter 0 if there are none.`,
        ),
      );
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/* ------------------------------------------------------------------ */
/* Estimate                                                            */
/* ------------------------------------------------------------------ */

/** Trim trailing zeros from a percent: 6 → "6", 5.25 → "5.25". */
function fmtPct(pct: number): string {
  return pct.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Build the full deduction waterfall for a valid input set. Each line is
 * rounded to the dollar; totals are sums of the rounded lines.
 */
export function estimateProceeds(
  inputs: SellerProceedsInputs,
): EstimateOutcome {
  const validation = validateInputs(inputs);
  if (!validation.ok) return validation;

  const price = Math.round(inputs.salePrice);
  const first = Math.round(inputs.firstMortgageBalance);
  const second = Math.round(inputs.secondMortgageBalance);

  const lines: DeductionLine[] = [];

  if (first > 0) {
    lines.push({
      label: "First mortgage payoff",
      amount: first,
      note: "Your lender's official payoff figure may include accrued interest and fees — check your payoff statement.",
    });
  }
  if (second > 0) {
    lines.push({
      label: "Second mortgage / HELOC payoff",
      amount: second,
    });
  }

  const commission = Math.round(price * (inputs.commissionPct / 100));
  lines.push({
    label: `Broker commission (${fmtPct(inputs.commissionPct)}%)`,
    amount: commission,
    note: "Negotiable — the 6% default is illustrative only.",
  });

  const rpttRate =
    price <= NYC_RPTT_THRESHOLD ? NYC_RPTT_LOW_RATE : NYC_RPTT_HIGH_RATE;
  lines.push({
    label: "NYC transfer tax (RPTT)",
    amount: nycTransferTax(price),
    note:
      price <= NYC_RPTT_THRESHOLD
        ? "1% of the sale price — price is $500,000 or less (NYC RPTT residential rate)."
        : "1.425% of the full sale price — price is over $500,000 (NYC RPTT residential rate).",
  });
  lines.push({
    label: "NYS transfer tax",
    amount: nysTransferTax(price),
    note: "0.4% ($4 per $1,000) of the sale price — paid by the seller (grantor).",
  });

  const concessions = Math.round(inputs.sellerConcessions);
  if (concessions > 0) {
    lines.push({
      label: "Seller concessions",
      amount: concessions,
      note: "Credits to the buyer agreed in your contract — for example, repair credits or closing-cost help.",
    });
  }
  const attorney = Math.round(inputs.attorneyFee);
  if (attorney > 0) {
    lines.push({
      label: "Attorney fee",
      amount: attorney,
    });
  }
  const other = Math.round(inputs.otherSellerCosts);
  if (other > 0) {
    lines.push({
      label: "Other seller costs",
      amount: other,
      note: "For example, a co-op flip tax or building move-out / transfer fees.",
    });
  }

  const totalDeductions = lines.reduce((sum, l) => sum + l.amount, 0);
  const netProceeds = price - totalDeductions;
  const equityBeforeCosts = price - first - second;

  const rpttRatePct = `${(rpttRate * 100).toFixed(3).replace(/\.?0+$/, "")}%`;
  const assumptions: string[] = [
    `NYC transfer tax (RPTT): 1% of the price at $500,000 or less, 1.425% of the full price above $500,000 — residential: 1–3 family houses, individual condos, and co-ops. This estimate uses ${rpttRatePct}. Source: ${NYC_RPTT_SOURCE}. Rates verified October 2026.`,
    `NYS transfer tax: 0.4% of the price ($4 per $1,000) when the consideration exceeds $500, paid by the seller. Source: ${NYS_TRANSFER_TAX_SOURCE}. Rate verified October 2026.`,
    "The additional NYS transfer taxes for NYC residential sales of $3M or more (0.25% additional base tax plus 0.25%–2.9% supplemental tax) are NOT included — this estimate understates taxes above that threshold.",
    "Broker commission is a percentage of the gross sale price, not of equity. The 6% default is illustrative — commission is negotiable between you and your agent.",
    first === 0 && second === 0
      ? "No mortgage payoff included — you entered $0 balances (free and clear)."
      : "Mortgage payoffs use the balances you entered; your lender's official payoff statement may include accrued interest and fees.",
    "Capital-gains tax is EXCLUDED from this estimate: it depends on your holding period, cost basis, and whether the primary-residence exclusion applies. A CPA can estimate it.",
    "Figures are estimates, not professional advice. Consult a real-estate attorney and/or CPA before listing or selling.",
  ];

  return {
    ok: true,
    value: {
      salePrice: price,
      deductions: lines,
      totalDeductions,
      netProceeds,
      equityBeforeCosts,
      assumptions,
    },
  };
}
