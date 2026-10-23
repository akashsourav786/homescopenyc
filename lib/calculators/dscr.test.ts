import { describe, expect, it } from "vitest";
import { monthlyPayment } from "./buyer-qualification";
import {
  DSCR_GUIDANCE_NOTES,
  DSCR_RULES,
  loanFromMonthlyPayment,
  qualifyDscr,
  validateDscrInputs,
  type DscrInputs,
} from "./dscr";

function baseInputs(overrides: Partial<DscrInputs> = {}): DscrInputs {
  return {
    monthlyRent: 7500,
    monthlyTaxes: 1000,
    monthlyInsurance: 350,
    monthlyHOA: 0,
    downPayment: { mode: "amount", amount: 250000 },
    annualRatePct: 7.75,
    loanTermYears: 30,
    targetDscr: 1.0,
    ...overrides,
  };
}

describe("loanFromMonthlyPayment", () => {
  it("inverts monthlyPayment (round-trip)", () => {
    const pmt = monthlyPayment(500000, 6.5, 30);
    expect(loanFromMonthlyPayment(pmt, 6.5, 30)).toBeCloseTo(500000, -1);
  });

  it("handles a 0% rate as P&I × months", () => {
    expect(loanFromMonthlyPayment(1000, 0, 30)).toBe(360000);
  });

  it("returns 0 for non-positive P&I", () => {
    expect(loanFromMonthlyPayment(0, 7.75, 30)).toBe(0);
    expect(loanFromMonthlyPayment(-500, 7.75, 30)).toBe(0);
  });

  it("matches the 7.75% annuity anchor: $716.43 per $100K", () => {
    // Independently published amortization factor at 7.75% / 30yr.
    expect(monthlyPayment(100000, 7.75, 30)).toBeCloseTo(716.43, 0);
    // …so a max P&I of $6,150/mo sizes a loan of ≈ $858K.
    expect(loanFromMonthlyPayment(6150, 7.75, 30)).toBeCloseTo(858000, -3);
  });
});

describe("qualifyDscr — research-validated fixtures", () => {
  it("FreeFinCalc crossover: $3,000 rent, $525 T&I, 8% → $337,302 @ 1.00 and $255,532 @ 1.25", () => {
    const out = qualifyDscr(
      baseInputs({
        monthlyRent: 3000,
        monthlyTaxes: 400,
        monthlyInsurance: 125,
        monthlyHOA: 0,
        annualRatePct: 8,
        downPayment: { mode: "amount", amount: 0 },
        targetDscr: 1.0,
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const at100 = out.value.scenarios.find((s) => s.targetDscr === 1.0);
    const at125 = out.value.scenarios.find((s) => s.targetDscr === 1.25);
    // The raw (unfloored) sizing reproduces the published fixture exactly…
    expect(
      loanFromMonthlyPayment(at100?.maxPrincipalAndInterest ?? 0, 8, 30),
    ).toBeCloseTo(337302, -1);
    expect(
      loanFromMonthlyPayment(at125?.maxPrincipalAndInterest ?? 0, 8, 30),
    ).toBeCloseTo(255532, -1);
    // …and the reported loan is that figure floored to the nearest $1,000.
    for (const [scenario, fixture] of [
      [at100, 337302],
      [at125, 255532],
    ] as const) {
      expect(scenario?.maxLoan).toBeLessThanOrEqual(fixture);
      expect(scenario?.maxLoan).toBeGreaterThan(fixture - 1000);
    }
  });

  it("price identity: $7,500 rent, $1,350 T&I, 7.75%, 25% down → ≈ $1,145K price, ≈ $858K loan @ 1.00", () => {
    const out = qualifyDscr(
      baseInputs({
        downPayment: { mode: "percent", pct: 25 },
        targetDscr: 1.0,
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const sel = out.value.selected;
    expect(sel.maxPrice).toBeGreaterThan(1_140_000);
    expect(sel.maxPrice).toBeLessThan(1_150_000);
    expect(sel.maxLoan).toBeCloseTo(858000, -3);
    expect(sel.downPaymentPct).toBeCloseTo(0.25, 2);
    // Internal consistency: price = loan + down.
    expect(sel.maxPrice).toBeCloseTo(sel.maxLoan + sel.downPaymentAmount, 0);
  });

  it("cash mode: price = rent-sized loan + cash down payment", () => {
    const out = qualifyDscr(baseInputs());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const sel = out.value.selected;
    expect(sel.downPaymentAmount).toBe(250000);
    expect(sel.maxPrice).toBeCloseTo(sel.maxLoan + 250000, 0);
    // $7,500 rent, $1,350 fixed, 7.75% → loan ≈ $858K → price ≈ $1,108K.
    expect(sel.maxPrice).toBeGreaterThan(1_100_000);
    expect(sel.maxPrice).toBeLessThan(1_115_000);
  });
});

describe("qualifyDscr — ladder and design rules", () => {
  it("returns the full ladder in order, prices falling as the target rises", () => {
    const out = qualifyDscr(baseInputs({ targetDscr: 1.1 }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.scenarios.map((s) => s.targetDscr)).toEqual([
      ...DSCR_RULES.ratioLadder,
    ]);
    const [a, b, c] = out.value.scenarios;
    expect(a.maxPrice).toBeGreaterThan(b.maxPrice);
    expect(b.maxPrice).toBeGreaterThan(c.maxPrice);
    expect(out.value.selected.targetDscr).toBe(1.1);
  });

  it("does NOT cap the price at any LTV ceiling (guidance only, by design)", () => {
    // $100K cash on a ~$858K rent-sized loan implies ~90% LTV — above the
    // standard 80% guidance cap. The engine must still return the full
    // rent-sized price; the cap appears only in the guidance notes.
    const out = qualifyDscr(
      baseInputs({ downPayment: { mode: "amount", amount: 100000 } }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const sel = out.value.selected;
    expect(sel.maxPrice).toBeGreaterThan(900000);
    expect(sel.downPaymentPct).toBeLessThan(0.2);
    expect(DSCR_GUIDANCE_NOTES.length).toBeGreaterThan(0);
  });

  it("returns a zero scenario (not an error) when T&I eats the whole PITIA", () => {
    const out = qualifyDscr(
      baseInputs({
        monthlyRent: 1000,
        monthlyTaxes: 900,
        monthlyInsurance: 200,
        downPayment: { mode: "amount", amount: 0 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.selected.maxLoan).toBe(0);
    expect(out.value.selected.maxPrice).toBe(0);
    expect(out.value.selected.maxPrincipalAndInterest).toBe(0);
  });

  it("PITIA at the solved price rebuilds from its parts", () => {
    const out = qualifyDscr(baseInputs());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const m = out.value.selected.monthly;
    expect(m.total).toBeCloseTo(
      m.principalAndInterest + m.propertyTax + m.insurance + m.hoa,
      1,
    );
    // At a 1.00 target the solved PITIA sits at (just under) the rent.
    expect(m.total).toBeLessThanOrEqual(7500.01);
    expect(m.total).toBeGreaterThan(7400);
  });
});

describe("qualifyDscr — cash to close", () => {
  it("itemizes NYC closing costs and adds them to the down payment", () => {
    const out = qualifyDscr(baseInputs());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const sel = out.value.selected;
    // Price is > $1M in the base scenario → mansion tax line present.
    expect(sel.maxPrice).toBeGreaterThanOrEqual(1_000_000);
    const labels = sel.closingLines.map((l) => l.label);
    expect(labels.some((l) => l.includes("Mortgage recording tax"))).toBe(true);
    expect(labels.some((l) => l.includes("Mansion tax"))).toBe(true);
    expect(labels.some((l) => l.includes("Title insurance"))).toBe(true);
    const lineSum = sel.closingLines.reduce((s, l) => s + l.amount, 0);
    expect(sel.closingCostsTotal).toBeCloseTo(lineSum, 0);
    expect(sel.cashToClose).toBeCloseTo(
      sel.downPaymentAmount + sel.closingCostsTotal,
      0,
    );
  });

  it("omits the mansion tax line below $1M", () => {
    const out = qualifyDscr(
      baseInputs({
        monthlyRent: 3000,
        monthlyTaxes: 400,
        monthlyInsurance: 125,
        annualRatePct: 8,
        downPayment: { mode: "amount", amount: 50000 },
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const sel = out.value.selected;
    expect(sel.maxPrice).toBeLessThan(1_000_000);
    expect(
      sel.closingLines.some((l) => l.label.includes("Mansion tax")),
    ).toBe(false);
  });
});

describe("validateDscrInputs", () => {
  it("accepts the base inputs", () => {
    expect(validateDscrInputs(baseInputs()).ok).toBe(true);
  });

  it("rejects zero or negative rent", () => {
    for (const monthlyRent of [0, -100, NaN]) {
      const v = validateDscrInputs(baseInputs({ monthlyRent }));
      expect(v.ok).toBe(false);
      if (!v.ok)
        expect(v.issues.some((i) => i.code === "INVALID_RENT")).toBe(true);
    }
  });

  it("rejects negative monthly costs", () => {
    const v = validateDscrInputs(baseInputs({ monthlyInsurance: -1 }));
    expect(v.ok).toBe(false);
    if (!v.ok)
      expect(v.issues.some((i) => i.code === "INVALID_AMOUNT")).toBe(true);
  });

  it("rejects out-of-range rates and terms (existing conventions)", () => {
    expect(validateDscrInputs(baseInputs({ annualRatePct: 26 })).ok).toBe(
      false,
    );
    expect(validateDscrInputs(baseInputs({ annualRatePct: -0.5 })).ok).toBe(
      false,
    );
    expect(validateDscrInputs(baseInputs({ loanTermYears: 0 })).ok).toBe(
      false,
    );
    expect(validateDscrInputs(baseInputs({ loanTermYears: 41 })).ok).toBe(
      false,
    );
    expect(validateDscrInputs(baseInputs({ loanTermYears: 30.5 })).ok).toBe(
      false,
    );
  });

  it("rejects a 100% down payment in percent mode (no loan to size)", () => {
    const v = validateDscrInputs(
      baseInputs({ downPayment: { mode: "percent", pct: 100 } }),
    );
    expect(v.ok).toBe(false);
    if (!v.ok)
      expect(v.issues.some((i) => i.code === "INVALID_DOWN_PAYMENT")).toBe(
        true,
      );
  });

  it("rejects a target DSCR outside the ladder", () => {
    const v = validateDscrInputs(baseInputs({ targetDscr: 1.15 }));
    expect(v.ok).toBe(false);
    if (!v.ok)
      expect(v.issues.some((i) => i.code === "INVALID_TARGET_DSCR")).toBe(
        true,
      );
  });

  it("qualifyDscr surfaces validation failures as issues", () => {
    const out = qualifyDscr(baseInputs({ monthlyRent: 0 }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues.length).toBeGreaterThan(0);
  });
});
