import { describe, expect, it } from "vitest";
import {
  ATTORNEY_FEE,
  calculateMonthlyCost,
  mansionTax,
  mansionTaxRate,
  recordingTax,
  TITLE_INSURANCE_PCT,
  type MonthlyCostInputs,
} from "./monthly-cost";

function baseInputs(
  overrides: Partial<MonthlyCostInputs> = {},
): MonthlyCostInputs {
  return {
    purchasePrice: 600000,
    downPayment: { mode: "percent", pct: 20 },
    annualRatePct: 6.5,
    loanTermYears: 30,
    annualPropertyTax: 7200,
    annualInsurance: 1800,
    monthlyHOA: 0,
    loanProgramId: "conventional",
    ...overrides,
  };
}

describe("recordingTax", () => {
  it("charges 1.80% of the loan below $500k", () => {
    expect(recordingTax(400000)).toBeCloseTo(7200, 2);
  });

  it("charges 1.925% of the loan at $500k or more", () => {
    // The $500k line itself uses the higher rate ("$500,000 or more").
    expect(recordingTax(500000)).toBeCloseTo(9625, 2);
    expect(recordingTax(600000)).toBeCloseTo(11550, 2);
  });

  it("is 0 for a non-positive loan", () => {
    expect(recordingTax(0)).toBe(0);
    expect(recordingTax(-100)).toBe(0);
  });
});

describe("mansionTax", () => {
  it("is 0 below $1M", () => {
    expect(mansionTax(999999)).toBe(0);
    expect(mansionTaxRate(999999)).toBeNull();
  });

  it("applies 1% to the ENTIRE price at $1M (not marginal)", () => {
    expect(mansionTaxRate(1000000)).toBe(0.01);
    expect(mansionTax(1000000)).toBe(10000);
  });

  it("steps to 1.25% at $2M, still on the entire price", () => {
    // Marginal math would give $12,500 — the graduated NYC structure
    // re-prices the whole deal: $2M × 1.25% = $25,000.
    expect(mansionTaxRate(2000000)).toBe(0.0125);
    expect(mansionTax(2000000)).toBe(25000);
  });

  it("reaches 2.25% at $5M and 3.9% at $25M", () => {
    expect(mansionTax(5000000)).toBe(112500);
    expect(mansionTax(25000000)).toBe(975000);
  });
});

describe("calculateMonthlyCost", () => {
  it("breaks down a known fixture: $600k, 20% down, 6.5%/30yr", () => {
    const out = calculateMonthlyCost(
      baseInputs({ monthlyHOA: 500 }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value;
    expect(r.downPaymentAmount).toBeCloseTo(120000, 2);
    expect(r.mortgageAmount).toBeCloseTo(480000, 2);
    // $480k @ 6.5%/30yr = 1.2 × the $400k fixture ($2,528.27) ≈ $3,033.93.
    expect(r.monthly.principalAndInterest).toBeCloseTo(3033.93, 1);
    expect(r.monthly.propertyTax).toBeCloseTo(600, 2);
    expect(r.monthly.insurance).toBeCloseTo(150, 2);
    expect(r.monthly.hoa).toBe(500);
    expect(r.monthly.mortgageInsurance).toBe(0); // 20% down → no PMI
    expect(r.monthly.total).toBeCloseTo(4283.93, 1);
  });

  it("applies conventional PMI below 20% down and drops it at 20%", () => {
    const below = calculateMonthlyCost(
      baseInputs({ downPayment: { mode: "percent", pct: 10 } }),
    );
    const atTwenty = calculateMonthlyCost(baseInputs());
    expect(below.ok && atTwenty.ok).toBe(true);
    if (!below.ok || !atTwenty.ok) return;
    // $540k loan × 0.50%/yr ÷ 12 = $225/mo.
    expect(below.value.monthly.mortgageInsurance).toBeCloseTo(225, 2);
    expect(atTwenty.value.monthly.mortgageInsurance).toBe(0);
  });

  it("finances FHA upfront MIP and charges monthly MIP", () => {
    const out = calculateMonthlyCost(
      baseInputs({
        loanProgramId: "fha",
        downPayment: { mode: "percent", pct: 3.5 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value;
    // $579k base loan × 1.0175 upfront MIP financed in.
    expect(r.mortgageAmount).toBeCloseTo(579000 * 1.0175, 1);
    expect(r.mortgageAmount).toBeGreaterThan(r.purchasePrice - r.downPaymentAmount);
    // Monthly MIP: loan × 0.55%/yr ÷ 12.
    expect(r.monthly.mortgageInsurance).toBeCloseTo(
      r.mortgageAmount * 0.0055 / 12,
      1,
    );
  });

  it("VA charges no monthly MI but finances the funding fee", () => {
    const out = calculateMonthlyCost(
      baseInputs({
        loanProgramId: "va",
        downPayment: { mode: "percent", pct: 0 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value;
    expect(r.monthly.mortgageInsurance).toBe(0);
    expect(r.mortgageAmount).toBeCloseTo(600000 * 1.0215, 1);
  });

  it("cash-to-close at $1.2M includes recording tax + mansion tax line items", () => {
    const out = calculateMonthlyCost(
      baseInputs({
        purchasePrice: 1200000,
        downPayment: { mode: "percent", pct: 10 },
        annualPropertyTax: 12000,
        annualInsurance: 2400,
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value;
    const lines = Object.fromEntries(r.closingCosts.map((l) => [l.label, l.amount]));
    // $1.08M loan ≥ $500k → 1.925% recording tax on the loan.
    expect(lines["Mortgage recording tax (borrower portion)"]).toBeCloseTo(20790, 1);
    // $1.2M price → 1% mansion tax on the full price.
    expect(lines["Mansion tax (1.00% of full price)"]).toBe(12000);
    expect(r.mansionTaxRate).toBe(0.01);
    // Title insurance: 0.45% of price.
    expect(lines["Title insurance (illustrative)"]).toBeCloseTo(
      1200000 * TITLE_INSURANCE_PCT,
      1,
    );
    // Attorney: illustrative flat fee.
    expect(lines["Attorney fee (illustrative)"]).toBe(ATTORNEY_FEE);
    // 3.5% of $1.2M = $42,000 target; modeled $41,690 → misc plug $310.
    expect(lines["Lender & third-party fees (misc., illustrative)"]).toBeCloseTo(
      310,
      1,
    );
    // $120k down + $20,790 + $12,000 + $5,400 + $3,500 + $310 = $162,000.
    expect(r.cashToClose).toBeCloseTo(162000, 1);
    expect(r.closingCostsTotal).toBeCloseTo(42000, 1);
  });

  it("omits the mansion-tax line below $1M", () => {
    const out = calculateMonthlyCost(baseInputs());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(
      out.value.closingCosts.some((l) => l.label.startsWith("Mansion tax")),
    ).toBe(false);
    expect(out.value.mansionTaxRate).toBeNull();
  });

  it("misc lender-fee line fills closing costs to 3.5% of price", () => {
    // $800k price, 50% down: $400k loan → 1.8% recording tax = $7,200;
    // title 0.45% = $3,600; attorney $3,500 → $14,300 modeled.
    // 3.5% of $800k = $28,000 → misc plug = $13,700; total exactly $28,000.
    const out = calculateMonthlyCost(
      baseInputs({
        purchasePrice: 800000,
        downPayment: { mode: "percent", pct: 50 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value;
    const misc = r.closingCosts.find((l) =>
      l.label.startsWith("Lender & third-party fees"),
    );
    expect(misc).toBeDefined();
    expect(misc!.amount).toBeCloseTo(13700, 1);
    expect(misc!.illustrative).toBe(true);
    expect(r.closingCostsTotal).toBeCloseTo(28000, 1);
    expect(r.closingCostsTotal / r.purchasePrice).toBeCloseTo(0.035, 4);
  });

  it("omits the misc line when modeled costs already exceed 3.5% of price", () => {
    // $2.5M price, 10% down: $2.25M loan → 1.925% recording = $43,312.50;
    // mansion 1.25% = $31,250; title 0.45% = $11,250; attorney $3,500 →
    // $89,312.50 = 3.57% > 3.5% benchmark → misc $0, line omitted.
    const out = calculateMonthlyCost(
      baseInputs({
        purchasePrice: 2500000,
        downPayment: { mode: "percent", pct: 10 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(
      out.value.closingCosts.some((l) =>
        l.label.startsWith("Lender & third-party fees"),
      ),
    ).toBe(false);
    expect(out.value.closingCostsTotal).toBeCloseTo(89312.5, 1);
    expect(
      out.value.assumptions.some((s) => s.includes("no misc. lender")),
    ).toBe(true);
  });

  it("cash-to-close equals down payment plus the closing-cost lines", () => {
    const out = calculateMonthlyCost(
      baseInputs({ downPayment: { mode: "amount", amount: 60000 } }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value;
    expect(r.downPct).toBeCloseTo(0.1, 10);
    expect(r.downPaymentAmount).toBe(60000);
    const sum = r.closingCosts.reduce((s, l) => s + l.amount, 0);
    expect(r.closingCostsTotal).toBeCloseTo(sum, 2);
    expect(r.cashToClose).toBeCloseTo(r.downPaymentAmount + sum, 2);
  });

  it("HOA-only difference: same total minus $500 HOA, same cash to close", () => {
    const withHOA = calculateMonthlyCost(baseInputs({ monthlyHOA: 500 }));
    const withoutHOA = calculateMonthlyCost(baseInputs({ monthlyHOA: 0 }));
    expect(withHOA.ok && withoutHOA.ok).toBe(true);
    if (!withHOA.ok || !withoutHOA.ok) return;
    expect(withHOA.value.monthly.total).toBeCloseTo(
      withoutHOA.value.monthly.total + 500,
      2,
    );
    expect(withHOA.value.cashToClose).toBe(withoutHOA.value.cashToClose);
  });

  it("handles a 0% rate as principal / months", () => {
    const out = calculateMonthlyCost(
      baseInputs({ annualRatePct: 0, monthlyHOA: 0, annualPropertyTax: 0, annualInsurance: 0 }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // $480k / 360 months = $1,333.33.
    expect(out.value.monthly.principalAndInterest).toBeCloseTo(1333.33, 1);
  });

  it("credit tier adjusts the effective rate and nothing else", () => {
    const base = calculateMonthlyCost(baseInputs());
    const tiered = calculateMonthlyCost(
      baseInputs({ creditTierId: "good" }),
    );
    expect(base.ok && tiered.ok).toBe(true);
    if (!base.ok || !tiered.ok) return;
    expect(tiered.value.effectiveRatePct).toBe(6.75); // 6.5 + 0.25
    expect(base.value.effectiveRatePct).toBe(6.5);
    // The tier never changes cash-to-close (no multiplier, no gating).
    expect(tiered.value.cashToClose).toBe(base.value.cashToClose);
    // …but the illustrative rate does move the P&I.
    expect(tiered.value.monthly.principalAndInterest).toBeGreaterThan(
      base.value.monthly.principalAndInterest,
    );
  });
});

describe("validateInputs", () => {
  it("rejects a non-positive purchase price", () => {
    const out = calculateMonthlyCost(baseInputs({ purchasePrice: -500 }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.code === "INVALID_PRICE")).toBe(true);
  });

  it("rejects a garbage (NaN) interest rate", () => {
    const out = calculateMonthlyCost(baseInputs({ annualRatePct: NaN }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.code === "INVALID_RATE")).toBe(true);
  });

  it("rejects a down-payment amount above the purchase price", () => {
    const out = calculateMonthlyCost(
      baseInputs({ downPayment: { mode: "amount", amount: 700000 } }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(
      out.issues.some((i) => i.code === "DOWN_PAYMENT_EXCEEDS_PRICE"),
    ).toBe(true);
  });

  it("rejects a down payment below the program minimum", () => {
    const out = calculateMonthlyCost(
      baseInputs({ downPayment: { mode: "percent", pct: 2 } }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(
      out.issues.some((i) => i.code === "BELOW_PROGRAM_MINIMUM"),
    ).toBe(true);
  });

  it("rejects a negative HOA", () => {
    const out = calculateMonthlyCost(baseInputs({ monthlyHOA: -50 }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.field === "monthlyHOA")).toBe(true);
  });

  it("rejects an unknown loan program", () => {
    const out = calculateMonthlyCost(
      baseInputs({ loanProgramId: "usda" as never }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.code === "UNKNOWN_PROGRAM")).toBe(true);
  });

  it("rejects an unknown credit tier", () => {
    const out = calculateMonthlyCost(
      baseInputs({ creditTierId: "platinum" }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.code === "UNKNOWN_TIER")).toBe(true);
  });

  it("rejects a non-integer loan term", () => {
    const out = calculateMonthlyCost(
      baseInputs({ loanTermYears: 29.5 }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.code === "INVALID_TERM")).toBe(true);
  });

  it("returns all issues at once for multiple bad fields", () => {
    const out = calculateMonthlyCost(
      baseInputs({
        purchasePrice: 0,
        annualRatePct: 99,
        monthlyHOA: -1,
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.length).toBeGreaterThanOrEqual(3);
  });
});
