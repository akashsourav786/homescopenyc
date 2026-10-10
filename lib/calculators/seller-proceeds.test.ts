import { describe, expect, it } from "vitest";
import {
  estimateProceeds,
  nycTransferTax,
  nysTransferTax,
  validateInputs,
  type SellerProceedsInputs,
} from "./seller-proceeds";

function baseInputs(
  overrides: Partial<SellerProceedsInputs> = {},
): SellerProceedsInputs {
  return {
    salePrice: 1000000,
    firstMortgageBalance: 400000,
    secondMortgageBalance: 0,
    commissionPct: 6,
    sellerConcessions: 0,
    attorneyFee: 2500,
    otherSellerCosts: 0,
    ...overrides,
  };
}

function lines(out: { ok: true; value: { deductions: { label: string; amount: number }[] } }) {
  return out.value.deductions;
}

describe("nycTransferTax", () => {
  it("charges 1% at or below the $500k threshold", () => {
    expect(nycTransferTax(500000)).toBe(5000);
    expect(nycTransferTax(400000)).toBe(4000);
  });

  it("charges 1.425% of the FULL price above $500k (not a marginal bracket)", () => {
    // $1,000,000 × 1.425% = $14,250 — the city's own example figure.
    expect(nycTransferTax(1000000)).toBe(14250);
  });

  it("applies the higher rate to the first dollar above $500k", () => {
    // $500,001 × 1.425% = 7125.00143… → $7,125.
    expect(nycTransferTax(500001)).toBe(7125);
  });

  it("returns 0 for non-positive prices", () => {
    expect(nycTransferTax(0)).toBe(0);
    expect(nycTransferTax(-100)).toBe(0);
  });
});

describe("nysTransferTax", () => {
  it("charges 0.4% of the price", () => {
    expect(nysTransferTax(1000000)).toBe(4000);
    expect(nysTransferTax(500000)).toBe(2000);
  });

  it("is 0 when the consideration is $500 or less", () => {
    expect(nysTransferTax(500)).toBe(0);
  });
});

describe("estimateProceeds", () => {
  it("produces the full waterfall on the known $1M fixture", () => {
    const out = estimateProceeds(baseInputs());
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const l = lines(out);
    expect(l.map((d) => d.label)).toEqual([
      "First mortgage payoff",
      "Broker commission (6%)",
      "NYC transfer tax (RPTT)",
      "NYS transfer tax",
      "Attorney fee",
    ]);
    expect(l.map((d) => d.amount)).toEqual([
      400000, // first mortgage payoff
      60000, // 6% commission
      14250, // 1.425% RPTT (> $500k)
      4000, // 0.4% NYS
      2500, // attorney
    ]);

    expect(out.value.totalDeductions).toBe(480750);
    // Total deductions must equal the sum of the displayed lines.
    expect(out.value.totalDeductions).toBe(
      l.reduce((s, d) => s + d.amount, 0),
    );
    expect(out.value.netProceeds).toBe(1000000 - 480750);
    expect(out.value.netProceeds).toBe(519250);
    expect(out.value.equityBeforeCosts).toBe(600000);
  });

  it("labels the RPTT rate and cites the source in the assumptions", () => {
    const out = estimateProceeds(baseInputs());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const text = out.value.assumptions.join("\n");
    expect(text).toContain("1.425%");
    expect(text).toContain("NYC Department of Finance");
    expect(text).toContain("0.4%");
  });

  it("uses the 1% RPTT rate for a $500k sale", () => {
    const out = estimateProceeds(
      baseInputs({ salePrice: 500000, firstMortgageBalance: 0, attorneyFee: 0 }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const l = lines(out);
    expect(l.find((d) => d.label === "NYC transfer tax (RPTT)")?.amount).toBe(
      5000,
    );
    expect(l.find((d) => d.label === "NYS transfer tax")?.amount).toBe(2000);
  });

  it("lists two mortgage balances as separate lines", () => {
    const out = estimateProceeds(
      baseInputs({ secondMortgageBalance: 75000 }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const l = lines(out);
    expect(l.map((d) => d.label)).toEqual([
      "First mortgage payoff",
      "Second mortgage / HELOC payoff",
      "Broker commission (6%)",
      "NYC transfer tax (RPTT)",
      "NYS transfer tax",
      "Attorney fee",
    ]);
    expect(l[1].amount).toBe(75000);
    expect(out.value.totalDeductions).toBe(480750 + 75000);
    expect(out.value.netProceeds).toBe(1000000 - 555750);
    expect(out.value.equityBeforeCosts).toBe(525000);
  });

  it("omits mortgage lines when the home is owned free and clear", () => {
    const out = estimateProceeds(
      baseInputs({ firstMortgageBalance: 0, attorneyFee: 2500 }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const labels = lines(out).map((d) => d.label);
    expect(labels).not.toContain("First mortgage payoff");
    expect(labels).not.toContain("Second mortgage / HELOC payoff");
    expect(out.value.netProceeds).toBe(
      1000000 - 60000 - 14250 - 4000 - 2500,
    );
    expect(out.value.assumptions.join("\n")).toContain("free and clear");
  });

  it("includes concessions and other costs only when they are positive", () => {
    const withCosts = estimateProceeds(
      baseInputs({ sellerConcessions: 10000, otherSellerCosts: 3000 }),
    );
    expect(withCosts.ok).toBe(true);
    if (!withCosts.ok) return;
    const labels = lines(withCosts).map((d) => d.label);
    expect(labels).toContain("Seller concessions");
    expect(labels).toContain("Other seller costs");
    expect(withCosts.value.totalDeductions).toBe(480750 + 10000 + 3000);

    const without = estimateProceeds(baseInputs());
    expect(without.ok).toBe(true);
    if (!without.ok) return;
    const plainLabels = lines(without).map((d) => d.label);
    expect(plainLabels).not.toContain("Seller concessions");
    expect(plainLabels).not.toContain("Other seller costs");
  });

  it("allows a 0% commission and computes it on the gross price", () => {
    const out = estimateProceeds(baseInputs({ commissionPct: 0 }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const line = lines(out).find(
      (d) => d.label === "Broker commission (0%)",
    );
    expect(line?.amount).toBe(0);
  });

  it("formats fractional commission percentages in the label", () => {
    const out = estimateProceeds(baseInputs({ commissionPct: 5.5 }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const line = lines(out).find((d) => d.label.includes("Broker commission"));
    expect(line?.label).toBe("Broker commission (5.5%)");
    expect(line?.amount).toBe(55000);
  });

  it("reports a negative net when the seller is underwater", () => {
    // $500k sale, $550k mortgage: RPTT is 1% ($5k) at exactly $500k.
    const out = estimateProceeds(
      baseInputs({
        salePrice: 500000,
        firstMortgageBalance: 550000,
        attorneyFee: 0,
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.netProceeds).toBe(
      500000 - 550000 - 30000 - 5000 - 2000,
    );
    expect(out.value.netProceeds).toBeLessThan(0);
  });
});

describe("validateInputs", () => {
  it("accepts the base fixture", () => {
    expect(validateInputs(baseInputs()).ok).toBe(true);
  });

  it("rejects a non-positive sale price", () => {
    for (const price of [-100, 0, NaN]) {
      const r = validateInputs(baseInputs({ salePrice: price }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.issues.some((i) => i.code === "INVALID_SALE_PRICE")).toBe(true);
    }
  });

  it("rejects negative mortgage balances", () => {
    const r1 = validateInputs(baseInputs({ firstMortgageBalance: -1 }));
    expect(r1.ok).toBe(false);
    const r2 = validateInputs(baseInputs({ secondMortgageBalance: -1 }));
    expect(r2.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.issues.some((i) => i.code === "INVALID_MORTGAGE_BALANCE")).toBe(
        true,
      );
    }
  });

  it("rejects commission outside 0–100", () => {
    for (const pct of [-1, 101]) {
      const r = validateInputs(baseInputs({ commissionPct: pct }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.issues.some((i) => i.code === "INVALID_COMMISSION")).toBe(true);
    }
  });

  it("rejects negative cost fields", () => {
    for (const field of [
      "sellerConcessions",
      "attorneyFee",
      "otherSellerCosts",
    ] as const) {
      const r = validateInputs(baseInputs({ [field]: -50 }));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.issues.some((i) => i.code === "INVALID_AMOUNT")).toBe(true);
    }
  });

  it("collects multiple issues at once", () => {
    const r = validateInputs(
      baseInputs({ salePrice: -1, commissionPct: 150, attorneyFee: -5 }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.length).toBe(3);
  });
});
