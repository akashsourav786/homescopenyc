import { describe, expect, it } from "vitest";
import {
  monthlyPayment,
  qualifyBuyer,
  sensitivity,
  type BuyerQualificationInputs,
} from "./buyer-qualification";

function baseInputs(
  overrides: Partial<BuyerQualificationInputs> = {},
): BuyerQualificationInputs {
  return {
    annualIncome: 150000,
    monthlyDebts: 500,
    savings: 120000,
    downPayment: { mode: "percent", pct: 10 },
    loanProgramId: "conventional",
    annualRatePct: 6.5,
    loanTermYears: 30,
    annualPropertyTax: 6000,
    annualInsurance: 1800,
    monthlyHOA: 0,
    closingCostPct: 0.03,
    ...overrides,
  };
}

describe("monthlyPayment", () => {
  it("matches the known amortization value for $400k @ 6.5% / 30yr", () => {
    // Independently verified: M = P·r(1+r)^n / ((1+r)^n − 1) = 2528.2721…
    expect(monthlyPayment(400000, 6.5, 30)).toBeCloseTo(2528.27, 1);
  });

  it("handles a 0% rate as principal / months", () => {
    expect(monthlyPayment(360000, 0, 30)).toBe(1000);
  });

  it("returns 0 for non-positive principal", () => {
    expect(monthlyPayment(0, 6.5, 30)).toBe(0);
    expect(monthlyPayment(-100, 6.5, 30)).toBe(0);
  });
});

describe("qualifyBuyer", () => {
  it("produces conservative and higher scenarios with sane numbers", () => {
    const out = qualifyBuyer(baseInputs());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { conservative, higher } = out.value;
    expect(higher.maxPrice).toBeGreaterThan(0);
    expect(conservative.maxPrice).toBeLessThanOrEqual(higher.maxPrice);
    // Cash to close must respect savings and equal down + closing costs.
    expect(higher.cashToClose).toBeLessThanOrEqual(120000.01);
    expect(higher.cashToClose).toBeCloseTo(
      higher.downPaymentAmount + higher.closingCosts,
      0,
    );
  });

  it("back-end DTI equals front-end DTI when debts are zero", () => {
    const out = qualifyBuyer(baseInputs({ monthlyDebts: 0 }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value.higher;
    expect(r.backEndDTI).toBeCloseTo(r.frontEndDTI, 10);
    expect(r.bindingConstraint).toBe("front-end DTI");
  });

  it("is monotone: a higher rate lowers the max price", () => {
    const low = qualifyBuyer(baseInputs({ annualRatePct: 6 }));
    const high = qualifyBuyer(baseInputs({ annualRatePct: 8 }));
    expect(low.ok && high.ok).toBe(true);
    if (!low.ok || !high.ok) return;
    expect(high.value.higher.maxPrice).toBeLessThan(
      low.value.higher.maxPrice,
    );
  });

  it("rejects a down payment larger than savings", () => {
    const out = qualifyBuyer(
      baseInputs({
        downPayment: { mode: "amount", amount: 200000 },
        savings: 120000,
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(
      out.issues.some((i) => i.code === "DOWN_PAYMENT_EXCEEDS_SAVINGS"),
    ).toBe(true);
  });

  it("rejects non-positive income", () => {
    const out = qualifyBuyer(baseInputs({ annualIncome: 0 }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.code === "INVALID_INCOME")).toBe(true);
  });

  it("rejects a down payment below the program minimum", () => {
    const out = qualifyBuyer(
      baseInputs({
        loanProgramId: "fha",
        downPayment: { mode: "percent", pct: 3 },
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(
      out.issues.some((i) => i.code === "BELOW_PROGRAM_MINIMUM"),
    ).toBe(true);
  });

  it("runs the FHA 3.5%-down path and applies MIP", () => {
    const out = qualifyBuyer(
      baseInputs({
        loanProgramId: "fha",
        downPayment: { mode: "percent", pct: 3.5 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value.higher;
    expect(r.maxPrice).toBeGreaterThan(0);
    expect(r.monthly.mortgageInsurance).toBeGreaterThan(0);
    // Upfront MIP is financed: mortgage amount exceeds price − down.
    expect(r.mortgageAmount).toBeGreaterThan(
      r.maxPrice - r.downPaymentAmount,
    );
  });

  it("applies PMI below 20% down and drops it at 20% (conventional)", () => {
    const below = qualifyBuyer(
      baseInputs({ downPayment: { mode: "percent", pct: 10 } }),
    );
    const atTwenty = qualifyBuyer(
      baseInputs({ downPayment: { mode: "percent", pct: 20 } }),
    );
    expect(below.ok && atTwenty.ok).toBe(true);
    if (!below.ok || !atTwenty.ok) return;
    expect(below.value.higher.monthly.mortgageInsurance).toBeGreaterThan(0);
    expect(atTwenty.value.higher.monthly.mortgageInsurance).toBe(0);
  });

  it("VA charges no monthly MI but finances the funding fee", () => {
    const out = qualifyBuyer(
      baseInputs({
        loanProgramId: "va",
        downPayment: { mode: "percent", pct: 0 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.value.higher;
    expect(r.monthly.mortgageInsurance).toBe(0);
    expect(r.mortgageAmount).toBeGreaterThan(r.maxPrice); // 0 down + fee
  });

  it("caps the price by cash when savings are the binding constraint", () => {
    const out = qualifyBuyer(
      baseInputs({ annualIncome: 500000, savings: 60000 }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.higher.bindingConstraint).toBe("cash available");
    // 60k / (10% + 3%) ≈ $461,538 → floored to $461,000
    expect(out.value.higher.maxPrice).toBe(461000);
  });
});

describe("sensitivity", () => {
  it("moves the max price in the expected directions", () => {
    // monthlyDebts: 1500 makes the back-end DTI the binding constraint,
    // so debt changes actually move the result.
    const out = sensitivity(baseInputs({ monthlyDebts: 1500 }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const row = (label: string, change: string) =>
      out.rows.find((r) => r.label === label && r.change === change)!;

    expect(row("Interest rate", "+1%").delta).toBeLessThan(0);
    expect(row("Interest rate", "−1%").delta).toBeGreaterThan(0);
    expect(row("Monthly debts", "+$500").delta).toBeLessThan(0);
    expect(row("Down payment", "+5 pts").delta).toBeGreaterThanOrEqual(0);
  });

  it("returns validation issues for bad inputs instead of rows", () => {
    const out = sensitivity(baseInputs({ annualIncome: -1 }));
    expect(out.ok).toBe(false);
  });
});
