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
    propertyType: "single" as const,
    monthlyRentalIncome: 0,
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

  it("regression: real client scenario lands near the actual $710k approval", () => {
    // Akash's client: $130k income, 10% down, $6k/yr Bronx taxes, 740+
    // credit, no debt → lender approved $710k. With AUS-realistic caps the
    // engine must land in the same ballpark, not at the old ~$384k.
    const out = qualifyBuyer(
      baseInputs({
        annualIncome: 130000,
        monthlyDebts: 0,
        savings: 100000,
        downPayment: { mode: "percent", pct: 10 },
        creditTierId: "excellent",
        annualPropertyTax: 6000,
        annualInsurance: 2400,
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.higher.maxPrice).toBeGreaterThanOrEqual(650000);
    expect(out.value.higher.maxPrice).toBeLessThanOrEqual(750000);
  });

  it("conservative scenario lands near $474k for the client fixture (33% front-end binding)", () => {
    // Same client inputs, conservative caps (33/43): front-end binds at
    // $10,833 × 33% = $3,575/mo → ≈ $474k. Tight band keeps the two
    // scenarios usefully close instead of confusingly far apart.
    const out = qualifyBuyer(
      baseInputs({
        annualIncome: 130000,
        monthlyDebts: 0,
        savings: 100000,
        downPayment: { mode: "percent", pct: 10 },
        creditTierId: "excellent",
        annualPropertyTax: 6000,
        annualInsurance: 2400,
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.conservative.maxPrice).toBeGreaterThanOrEqual(472000);
    expect(out.value.conservative.maxPrice).toBeLessThanOrEqual(476000);
    expect(out.value.conservative.bindingConstraint).toBe("front-end DTI");
  });

  it("conservative and higher use the same effective rate (no cushion)", () => {
    const out = qualifyBuyer(baseInputs({ creditTierId: "good" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Both scenarios price the same loan: 6.5% base + 0.25% tier = 6.75%.
    expect(out.value.conservative.effectiveRatePct).toBe(6.75);
    expect(out.value.higher.effectiveRatePct).toBe(6.75);
  });

  it("assumptions cite the DTI cap sources for each program", () => {
    const conventional = qualifyBuyer(baseInputs({ loanProgramId: "conventional" }));
    expect(conventional.ok).toBe(true);
    if (conventional.ok) {
      const text = [
        ...conventional.value.conservative.assumptions,
        ...conventional.value.higher.assumptions,
      ].join(" ");
      expect(text).toContain("B3-6-02");
    }
    const fha = qualifyBuyer(
      baseInputs({ loanProgramId: "fha", downPayment: { mode: "percent", pct: 10 } }),
    );
    expect(fha.ok).toBe(true);
    if (fha.ok) {
      const text = [
        ...fha.value.conservative.assumptions,
        ...fha.value.higher.assumptions,
      ].join(" ");
      expect(text).toContain("4000.1");
    }
  });
});

describe("multifamily + rental income", () => {
  // savings is set high ($300k) so the DTI solve binds — at the default
  // $120k the cash cap would bind first and rental income couldn't move
  // the result (correct economics, unhelpful test).
  const multifamilyBase = () =>
    baseInputs({
      propertyType: "two-unit",
      downPayment: { mode: "percent", pct: 20 },
      monthlyRentalIncome: 3000,
      savings: 300000,
    });

  it("rental income raises the max price vs identical single-family inputs", () => {
    const single = qualifyBuyer(
      baseInputs({
        downPayment: { mode: "percent", pct: 20 },
        savings: 300000,
      }),
    );
    const multi = qualifyBuyer(multifamilyBase());
    expect(single.ok && multi.ok).toBe(true);
    if (!single.ok || !multi.ok) return;
    expect(multi.value.higher.maxPrice).toBeGreaterThan(
      single.value.higher.maxPrice,
    );
    // 75% × $3,000 = $2,250/mo counted toward qualifying income.
    expect(multi.value.higher.rentalIncomeCounted).toBeCloseTo(2250, 0);
  });

  it("counts exactly 75% of entered rental income", () => {
    // $2,000/mo rent × 75% = $1,500/mo = $18,000/yr of qualifying income.
    // Adding that $18k to base income on a single-family must give the
    // identical result — proving the haircut is exactly 75%.
    const viaRent = qualifyBuyer(
      baseInputs({
        propertyType: "two-unit",
        downPayment: { mode: "percent", pct: 20 },
        monthlyRentalIncome: 2000,
        savings: 300000,
      }),
    );
    const viaIncome = qualifyBuyer(
      baseInputs({
        annualIncome: 150000 + 18000,
        downPayment: { mode: "percent", pct: 20 },
        savings: 300000,
      }),
    );
    expect(viaRent.ok && viaIncome.ok).toBe(true);
    if (!viaRent.ok || !viaIncome.ok) return;
    expect(viaRent.value.higher.maxPrice).toBe(
      viaIncome.value.higher.maxPrice,
    );
  });

  it("rejects conventional 3–4 unit with 10% down, citing the 25% minimum", () => {
    const out = qualifyBuyer(
      baseInputs({
        propertyType: "three-four-unit",
        downPayment: { mode: "percent", pct: 10 },
      }),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    const issue = out.issues.find((i) => i.code === "BELOW_PROGRAM_MINIMUM");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("25");
  });

  it("accepts conventional 2-unit with 15% down (the unit minimum)", () => {
    const out = qualifyBuyer(
      baseInputs({
        propertyType: "two-unit",
        downPayment: { mode: "percent", pct: 15 },
      }),
    );
    expect(out.ok).toBe(true);
  });

  it("zero rental income on multifamily behaves like single-family", () => {
    const multi = qualifyBuyer(
      baseInputs({
        propertyType: "two-unit",
        downPayment: { mode: "percent", pct: 20 },
        monthlyRentalIncome: 0,
        savings: 300000,
      }),
    );
    const single = qualifyBuyer(
      baseInputs({
        downPayment: { mode: "percent", pct: 20 },
        savings: 300000,
      }),
    );
    expect(multi.ok && single.ok).toBe(true);
    if (!multi.ok || !single.ok) return;
    expect(multi.value.higher.maxPrice).toBe(single.value.higher.maxPrice);
    expect(multi.value.higher.rentalIncomeCounted).toBe(0);
  });

  it("rejects negative rental income", () => {
    const out = qualifyBuyer(baseInputs({ monthlyRentalIncome: -100 }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(
      out.issues.some((i) => i.code === "INVALID_RENTAL_INCOME"),
    ).toBe(true);
  });
});

describe("sensitivity", () => {
  it("moves the max price in the expected directions", () => {
    // monthlyDebts: 1500 makes the back-end DTI the binding constraint,
    // so debt changes actually move the result. savings: 200000 keeps the
    // DTI solve (not the cash cap) binding — with fixed savings, a bigger
    // down-payment percent would otherwise *shrink* the affordable price
    // (same cash, more per dollar down = less house), which is correct
    // economics but not what this direction test is checking.
    const out = sensitivity(baseInputs({ monthlyDebts: 1500, savings: 200000 }));
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
