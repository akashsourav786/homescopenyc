/**
 * "What's My Home Worth?" — unit tests for the comp-based estimator.
 *
 * NO live API calls here: pure functions are tested directly and the API
 * clients run against a mocked `fetch`. Fixture rows mirror the real DOF
 * sales shapes verified on 2026-10-10 (comma-formatted sqft strings, $0
 * transfers, float-free BBLs).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMP_LOOKBACK_DAYS,
  MIN_COMPS,
  applyMarketAdjustment,
  classLetter,
  classLetterLabel,
  estimateFromComps,
  estimateHomeValue,
  formatRangeK,
  getComparableSales,
  getLastArmsLengthDeed,
  getStabilizedBbls,
  hpiVintageLabel,
  isStabCode,
  lookbackIso,
  median,
  normalizeCompSale,
  parseBblParts,
  parseSqft,
  roundToNearest1k,
  saleQuarter,
  timeAdjustFactor,
} from "./home-worth";
import type { PropertyProfile } from "./types";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function subjectProfile(
  overrides: Partial<PropertyProfile> = {},
): PropertyProfile {
  return {
    bbl: "2025670010",
    displayAddress: "123 EXAMPLE ST, Bronx, NY, USA",
    borough: "The Bronx",
    block: "567",
    lot: "10",
    buildingClass: "B2",
    landUse: "Two-Family",
    yearBuilt: 1935,
    stories: 2,
    residentialUnits: 2,
    totalUnits: 2,
    lotSqft: 2500,
    buildingSqft: 2400,
    assessedValue: 450000,
    zoning: ["R5"],
    ownerName: null,
    zipCode: "10467",
    ...overrides,
  };
}

/** Raw DOF sales row shape (strings, comma-formatted sqft). */
function saleRow(overrides: Record<string, unknown> = {}) {
  return {
    sale_date: "2026-03-15T00:00:00.000",
    sale_price: "960000",
    gross_square_feet: "2,400",
    address: "456 SAMPLE AVE",
    building_class_at_time_of: "B2",
    bbl: "2025670020",
    ...overrides,
  };
}

/** Flat HPI series pinning the market-adjustment factor to exactly 1. */
const FLAT_HPI = {
  series: { "2026-Q1": 100 },
  vintage: "2026-Q1",
};
const FLAT_OPTS = { hpiSeries: FLAT_HPI.series, hpiVintage: FLAT_HPI.vintage };
/** Fixture HPI with a 10% rise Q1→Q2 for adjustment tests. */
const RISING_HPI = {
  series: { "2024-Q1": 400, "2024-Q2": 440 },
  vintage: "2024-Q2",
};

const mockFetch = (impl: (url: string) => unknown) => {
  const fn = vi.fn(async (url: string) => impl(url));
  vi.stubGlobal("fetch", fn);
  return fn;
};

const okJson = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => data,
  }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/* parseSqft                                                           */
/* ------------------------------------------------------------------ */

describe("parseSqft", () => {
  it("parses comma-formatted strings", () => {
    expect(parseSqft("3,096")).toBe(3096);
    expect(parseSqft("2,812,739")).toBe(2812739);
  });
  it("accepts plain numbers and numeric strings", () => {
    expect(parseSqft(2400)).toBe(2400);
    expect(parseSqft("2400")).toBe(2400);
  });
  it("rejects null, empty, zero, negative, and junk", () => {
    expect(parseSqft(null)).toBeNull();
    expect(parseSqft(undefined)).toBeNull();
    expect(parseSqft("")).toBeNull();
    expect(parseSqft("0")).toBeNull();
    expect(parseSqft("-50")).toBeNull();
    expect(parseSqft("n/a")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* classLetter / classLetterLabel                                      */
/* ------------------------------------------------------------------ */

describe("classLetter", () => {
  it("takes the first letter, uppercased", () => {
    expect(classLetter("B2")).toBe("B");
    expect(classLetter("r4")).toBe("R");
    expect(classLetter("D4")).toBe("D");
  });
  it("returns null without a leading letter", () => {
    expect(classLetter(null)).toBeNull();
    expect(classLetter("")).toBeNull();
    expect(classLetter("123")).toBeNull();
  });
});

describe("classLetterLabel", () => {
  it("labels common letters", () => {
    expect(classLetterLabel("B")).toBe("two-family homes");
    expect(classLetterLabel("A")).toBe("one-family homes");
  });
  it("falls back for unknown/null", () => {
    expect(classLetterLabel(null)).toBe("similar buildings");
    expect(classLetterLabel("Z")).toBe("similar buildings");
  });
});

/* ------------------------------------------------------------------ */
/* median / roundToNearest1k / formatRangeK                            */
/* ------------------------------------------------------------------ */

describe("median", () => {
  it("handles odd, even, single, and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });
});

describe("roundToNearest1k", () => {
  it("rounds to the nearest thousand", () => {
    expect(roundToNearest1k(812345)).toBe(812000);
    expect(roundToNearest1k(812500)).toBe(813000);
    expect(roundToNearest1k(0)).toBe(0);
  });
});

describe("formatRangeK", () => {
  it("formats compact thousands", () => {
    expect(formatRangeK(735000)).toBe("$735K");
    expect(formatRangeK(1500000)).toBe("$1,500K");
  });
  it("handles null", () => {
    expect(formatRangeK(null)).toBe("—");
  });
});

/* ------------------------------------------------------------------ */
/* normalizeCompSale                                                   */
/* ------------------------------------------------------------------ */

describe("normalizeCompSale", () => {
  it("normalizes a valid row with comma sqft", () => {
    const c = normalizeCompSale(saleRow());
    expect(c).not.toBeNull();
    expect(c!.price).toBe(960000);
    expect(c!.sqft).toBe(2400);
    expect(c!.pricePerSqft).toBeCloseTo(400, 6);
    expect(c!.address).toBe("456 SAMPLE AVE");
  });
  it("rejects $0, nominal, and missing prices", () => {
    expect(normalizeCompSale(saleRow({ sale_price: "0" }))).toBeNull();
    expect(normalizeCompSale(saleRow({ sale_price: "10" }))).toBeNull();
    expect(normalizeCompSale(saleRow({ sale_price: "999" }))).toBeNull();
    expect(normalizeCompSale(saleRow({ sale_price: null }))).toBeNull();
    expect(
      normalizeCompSale(saleRow({ sale_price: "1000" })),
    ).not.toBeNull();
  });
  it("rejects missing/invalid sqft", () => {
    expect(
      normalizeCompSale(saleRow({ gross_square_feet: null })),
    ).toBeNull();
    expect(normalizeCompSale(saleRow({ gross_square_feet: "" }))).toBeNull();
    expect(normalizeCompSale(saleRow({ gross_square_feet: "0" }))).toBeNull();
  });
  it("rejects bad dates", () => {
    expect(normalizeCompSale(saleRow({ sale_date: "not-a-date" }))).toBeNull();
    expect(normalizeCompSale(saleRow({ sale_date: "" }))).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* estimateFromComps                                                   */
/* ------------------------------------------------------------------ */

describe("estimateFromComps", () => {
  it("computes median $/sqft × subject sqft with a ±10% range", () => {
    // $/sqft: 400, 500, 600 → median 500 × 2400 sqft = $1,200,000
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }), // 400
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }), // 500
      saleRow({ sale_price: "1440000", gross_square_feet: "2,400" }), // 600
    ];
    const out = estimateFromComps(subjectProfile(), rows, FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.midpoint).toBe(1200000);
    expect(out.estimate.low).toBe(1080000);
    expect(out.estimate.high).toBe(1320000);
    expect(out.estimate.medianPricePerSqft).toBe(500);
    expect(out.estimate.compCount).toBe(3);
  });

  it("uses an even-count median correctly", () => {
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }), // 400
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }), // 500
      saleRow({ sale_price: "1440000", gross_square_feet: "2,400" }), // 600
      saleRow({ sale_price: "1400000", gross_square_feet: "2,000" }), // 700
    ];
    const out = estimateFromComps(subjectProfile(), rows, FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // median of [400,500,600,700] = 550 → 550 × 2400 = $1,320,000
    expect(out.estimate.midpoint).toBe(1320000);
    expect(out.estimate.low).toBe(1188000);
    expect(out.estimate.high).toBe(1452000);
  });

  it("filters invalid rows before counting comps", () => {
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
      saleRow({ sale_price: "0", gross_square_feet: "2,400" }), // $0 transfer
      saleRow({ sale_price: "1000000", gross_square_feet: null }), // no sqft
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }),
      saleRow({ sale_price: "1440000", gross_square_feet: "2,400" }),
    ];
    const out = estimateFromComps(subjectProfile(), rows, FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.compCount).toBe(3);
  });

  it("returns few-comps when fewer than MIN_COMPS are valid", () => {
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }),
    ];
    const out = estimateFromComps(subjectProfile(), rows, FLAT_OPTS);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("few-comps");
    expect(out.compsFound).toBe(2);
    expect(out.subject?.bbl).toBe("2025670010");
  });

  it("returns no-subject-sqft when the subject has no building sqft", () => {
    const out = estimateFromComps(
      subjectProfile({ buildingSqft: null }),
      [saleRow()],
      FLAT_OPTS,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no-subject-sqft");
    expect(out.compsFound).toBe(0);
  });

  it("builds a readable criteria note", () => {
    const rows = [
      saleRow(),
      saleRow({ sale_price: "1000000" }),
      saleRow({ sale_price: "1100000" }),
    ];
    const out = estimateFromComps(subjectProfile(), rows, FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.criteriaNote).toContain("two-family homes");
    expect(out.estimate.criteriaNote).toContain("10467");
  });
});

/* ------------------------------------------------------------------ */
/* getComparableSales (mocked fetch)                                   */
/* ------------------------------------------------------------------ */

describe("getComparableSales", () => {
  it("exact tier filters on the full building class", async () => {
    const seen: string[] = [];
    mockFetch((url: string) => {
      seen.push(url);
      return okJson([saleRow()]);
    });
    const rows = await getComparableSales("10467", "B2", "exact", "2025-10-10");
    expect(rows).toHaveLength(1);
    const url = decodeURIComponent(seen[0]);
    expect(url).toContain("data.cityofnewyork.us/resource/w2pb-icbu.json");
    expect(url).toContain("zip_code='10467'");
    expect(url).toContain("building_class_at_time_of='B2'");
    expect(url).not.toContain("starts_with");
    expect(url).toContain("sale_date DESC");
  });

  it("letter tier matches the class letter with starts_with", async () => {
    const seen: string[] = [];
    mockFetch((url: string) => {
      seen.push(url);
      return okJson([]);
    });
    await getComparableSales("10467", "B2", "letter", "2025-10-10");
    expect(decodeURIComponent(seen[0])).toContain(
      "starts_with(building_class_at_time_of,'B')",
    );
  });

  it("none tier applies no class filter", async () => {
    const seen: string[] = [];
    mockFetch((url: string) => {
      seen.push(url);
      return okJson([]);
    });
    await getComparableSales("10467", "B2", "none", "2025-10-10");
    expect(decodeURIComponent(seen[0])).not.toContain(
      "building_class_at_time_of",
    );
  });

  it("throws PropertyDataError on a non-array payload", async () => {
    mockFetch(() => okJson({ not: "an array" }));
    await expect(
      getComparableSales("10467", "B2", "exact", "2025-10-10"),
    ).rejects.toMatchObject({ name: "PropertyDataError", code: "parse" });
  });
});

describe("lookbackIso", () => {
  it("returns a date-only string ~365 days before now (calendar_date-safe)", () => {
    const now = new Date("2026-10-10T12:00:00.000Z").getTime();
    const iso = lookbackIso(COMP_LOOKBACK_DAYS, now);
    expect(iso).toBe("2025-10-10");
  });

  it("supports a wider window for the fallback tier", () => {
    const now = new Date("2026-10-10T12:00:00.000Z").getTime();
    expect(lookbackIso(730, now)).toBe("2024-10-10");
  });
});

/* ------------------------------------------------------------------ */
/* estimateHomeValue (mocked fetch, full pipeline)                     */
/* ------------------------------------------------------------------ */

const GEO_JSON = {
  features: [
    {
      properties: {
        label: "123 EXAMPLE ST, Bronx, NY, USA",
        borough: "Bronx",
        addendum: { pad: { bbl: "2025670010" } },
      },
    },
  ],
};

const PLUTO_ROWS = [
  {
    bbl: "2025670010",
    borough: "BX",
    block: "567",
    lot: "10",
    bldgclass: "B2",
    landuse: "2",
    yearbuilt: "1935",
    numfloors: "2",
    unitsres: "2",
    unitstotal: "2",
    lotarea: "2500",
    bldgarea: "2400",
    assesstot: "450000",
    zonedist1: "R5",
    zipcode: "10467",
  },
];

describe("estimateHomeValue", () => {
  function mockPipeline(salesRows: unknown[]) {
    return mockFetch((url: string) => {
      if (url.includes("geosearch.planninglabs.nyc")) return okJson(GEO_JSON);
      if (url.includes("64uk-42ks")) return okJson(PLUTO_ROWS);
      if (url.includes("w2pb-icbu")) return okJson(salesRows);
      // Enrichment endpoints: empty by default (no anchor, not stabilized).
      if (
        url.includes("8h5j-fqxa") ||
        url.includes("bnx9-e6tj") ||
        url.includes("muvi-b6kx")
      )
        return okJson([]);
      throw new Error("unexpected URL " + url);
    });
  }

  it("runs the full pipeline to an estimate", async () => {
    mockPipeline([
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }),
      saleRow({ sale_price: "1440000", gross_square_feet: "2,400" }),
    ]);
    const out = await estimateHomeValue("123 Example St, Bronx", FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.midpoint).toBe(1200000);
    expect(out.estimate.low).toBe(1080000);
    expect(out.estimate.high).toBe(1320000);
    expect(out.estimate.subject.bbl).toBe("2025670010");
    expect(out.estimate.windowDays).toBe(365);
    expect(out.estimate.classTier).toBe("exact");
    expect(out.estimate.anchor).toBeNull();
    expect(out.estimate.subjectStabilized).toBe(false);
  });

  it("throws not-found when the geocoder misses", async () => {
    mockFetch(() => okJson({ features: [] }));
    await expect(estimateHomeValue("asdf qwer")).rejects.toMatchObject({
      name: "PropertyDataError",
      code: "not-found",
    });
  });

  it("throws no-pluto when PLUTO has no record", async () => {
    mockFetch((url: string) => {
      if (url.includes("geosearch.planninglabs.nyc")) return okJson(GEO_JSON);
      return okJson([]);
    });
    await expect(estimateHomeValue("123 Example St, Bronx")).rejects.toMatchObject(
      {
        name: "PropertyDataError",
        code: "no-pluto",
      },
    );
  });

  it("returns few-comps (not throw) when sales are thin", async () => {
    mockPipeline([saleRow()]);
    const out = await estimateHomeValue("123 Example St, Bronx", FLAT_OPTS);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("few-comps");
    expect(out.compsFound).toBe(1);
    expect(out.subject?.displayAddress).toContain("123 EXAMPLE ST");
  });

  it("returns no-subject-sqft for a lot with no building area", async () => {
    mockFetch((url: string) => {
      if (url.includes("geosearch.planninglabs.nyc")) return okJson(GEO_JSON);
      if (url.includes("64uk-42ks"))
        return okJson([{ ...PLUTO_ROWS[0], bldgarea: null }]);
      return okJson([saleRow()]);
    });
    const out = await estimateHomeValue("123 Example St, Bronx", FLAT_OPTS);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no-subject-sqft");
  });

  it("requires at least MIN_COMPS valid comps", () => {
    expect(MIN_COMPS).toBe(3);
  });

  it("widens the window to 24 months when 12 months are thin", async () => {
    let salesCalls = 0;
    mockFetch((url: string) => {
      if (url.includes("geosearch.planninglabs.nyc")) return okJson(GEO_JSON);
      if (url.includes("64uk-42ks")) return okJson(PLUTO_ROWS);
      if (
        url.includes("8h5j-fqxa") ||
        url.includes("bnx9-e6tj") ||
        url.includes("muvi-b6kx")
      )
        return okJson([]);
      if (url.includes("w2pb-icbu")) {
        salesCalls++;
        return okJson(
          salesCalls === 1
            ? [saleRow()]
            : [
                saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
                saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }),
                saleRow({ sale_price: "1100000", gross_square_feet: "2,800" }),
              ],
        );
      }
      throw new Error("unexpected URL " + url);
    });
    const out = await estimateHomeValue("123 Example St, Bronx", FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(salesCalls).toBe(2);
    expect(out.estimate.windowDays).toBe(730);
    expect(out.estimate.classTier).toBe("exact");
    // $/sqft 400, 500, ~393 → median 400 × 2400 sqft
    expect(out.estimate.midpoint).toBe(960000);
  });

  it("attaches the ACRIS anchor and stabilization flags", async () => {
    mockFetch((url: string) => {
      if (url.includes("geosearch.planninglabs.nyc")) return okJson(GEO_JSON);
      if (url.includes("64uk-42ks")) return okJson(PLUTO_ROWS);
      if (url.includes("w2pb-icbu"))
        return okJson([
          saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
          saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }),
          saleRow({ sale_price: "1440000", gross_square_feet: "2,400" }),
        ]);
      if (url.includes("8h5j-fqxa"))
        return okJson([{ document_id: "2026081800268001" }]);
      if (url.includes("bnx9-e6tj"))
        return okJson([
          {
            document_id: "2026081800268001",
            doc_type: "DEED",
            document_date: "2026-08-04T00:00:00.000",
            document_amt: "707500",
          },
        ]);
      if (url.includes("muvi-b6kx")) return okJson([{ parid: "2025670010" }]);
      throw new Error("unexpected URL " + url);
    });
    const out = await estimateHomeValue("123 Example St, Bronx", FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.anchor?.price).toBe(707500);
    expect(out.estimate.anchor?.date).toBe("2026-08-04");
    expect(out.estimate.subjectStabilized).toBe(true);
    expect(out.estimate.stabilizedCompCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* saleQuarter / timeAdjustFactor / hpiVintageLabel                      */
/* ------------------------------------------------------------------ */

describe("saleQuarter", () => {
  it("maps ISO dates to quarters", () => {
    expect(saleQuarter("2025-11-26T00:00:00.000")).toBe("2025-Q4");
    expect(saleQuarter("2026-01-01")).toBe("2026-Q1");
    expect(saleQuarter("2024-06-30")).toBe("2024-Q2");
  });
  it("returns null for bad dates", () => {
    expect(saleQuarter("not-a-date")).toBeNull();
    expect(saleQuarter("")).toBeNull();
  });
});

describe("timeAdjustFactor", () => {
  it("scales by the index ratio", () => {
    expect(
      timeAdjustFactor("2024-02-15", RISING_HPI.series, RISING_HPI.vintage),
    ).toBeCloseTo(1.1, 6);
  });
  it("returns 1 for the vintage quarter or newer", () => {
    expect(
      timeAdjustFactor("2024-05-01", RISING_HPI.series, RISING_HPI.vintage),
    ).toBe(1);
    expect(
      timeAdjustFactor("2025-01-01", RISING_HPI.series, RISING_HPI.vintage),
    ).toBe(1);
  });
  it("returns 1 for unknown quarters or bad dates", () => {
    expect(
      timeAdjustFactor("1990-01-01", RISING_HPI.series, RISING_HPI.vintage),
    ).toBe(1);
    expect(timeAdjustFactor("junk", RISING_HPI.series, RISING_HPI.vintage)).toBe(
      1,
    );
  });
});

describe("hpiVintageLabel", () => {
  it("formats the vintage for display", () => {
    expect(hpiVintageLabel("2026-Q2")).toBe("Q2 2026");
  });
});

/* ------------------------------------------------------------------ */
/* normalizeCompSale: BBL capture / applyMarketAdjustment               */
/* ------------------------------------------------------------------ */

describe("normalizeCompSale extras", () => {
  it("captures the comp BBL and defaults to no market adjustment", () => {
    const c = normalizeCompSale(saleRow())!;
    expect(c.bbl).toBe("2025670020");
    expect(c.adjustFactor).toBe(1);
    expect(c.adjustedPrice).toBe(c.price);
    expect(c.adjustedPricePerSqft).toBe(c.pricePerSqft);
    expect(c.stabilized).toBe(false);
  });
  it("nulls a malformed BBL", () => {
    expect(normalizeCompSale(saleRow({ bbl: "junk" }))!.bbl).toBeNull();
    expect(normalizeCompSale(saleRow({ bbl: null }))!.bbl).toBeNull();
  });
});

describe("applyMarketAdjustment", () => {
  it("scales price and $/sqft, leaving raw values untouched", () => {
    const c = normalizeCompSale(
      saleRow({
        sale_date: "2024-02-15T00:00:00.000",
        sale_price: "400000",
        gross_square_feet: "1,000",
      }),
    )!;
    const [adj] = applyMarketAdjustment([c], RISING_HPI.series, RISING_HPI.vintage);
    expect(adj.adjustFactor).toBeCloseTo(1.1, 6);
    expect(adj.adjustedPrice).toBe(440000);
    expect(adj.adjustedPricePerSqft).toBeCloseTo(440, 6);
    expect(adj.price).toBe(400000);
    expect(c.adjustFactor).toBe(1); // input untouched
  });
});

/* ------------------------------------------------------------------ */
/* estimateFromComps: size band + outlier trim                          */
/* ------------------------------------------------------------------ */

describe("estimateFromComps selection", () => {
  it("excludes comps outside the ±35% size band", () => {
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }), // in band
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }), // in band
      saleRow({ sale_price: "1100000", gross_square_feet: "2,800" }), // in band
      saleRow({ sale_price: "2000000", gross_square_feet: "5,000" }), // OUT
    ];
    const out = estimateFromComps(subjectProfile(), rows, FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.compCount).toBe(3);
  });

  it("counts only in-band comps toward the minimum", () => {
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
      saleRow({ sale_price: "2000000", gross_square_feet: "5,000" }),
      saleRow({ sale_price: "3000000", gross_square_feet: "6,000" }),
    ];
    const out = estimateFromComps(subjectProfile(), rows, FLAT_OPTS);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("few-comps");
    expect(out.compsFound).toBe(1);
  });

  it("trims $/sqft outliers before the final median", () => {
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }), // 400
      saleRow({ sale_price: "1200000", gross_square_feet: "2,400" }), // 500
      saleRow({ sale_price: "1440000", gross_square_feet: "2,400" }), // 600
      saleRow({ sale_price: "7500", gross_square_feet: "1,700" }), // 4.4 — nominal
    ];
    const out = estimateFromComps(subjectProfile(), rows, FLAT_OPTS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Without the trim the $7,500 row would drag the median to 450.
    expect(out.estimate.medianPricePerSqft).toBe(500);
    expect(out.estimate.compCount).toBe(3);
    expect(out.estimate.midpoint).toBe(1200000);
  });

  it("marks stabilized comps from the provided BBL set", () => {
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }),
      saleRow({
        sale_price: "1100000",
        gross_square_feet: "2,800",
        bbl: "2025670099",
      }),
    ];
    const out = estimateFromComps(subjectProfile(), rows, {
      ...FLAT_OPTS,
      stabilizedBbls: new Set(["2025670099", "2025670010"]),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.stabilizedCompCount).toBe(1);
    expect(out.estimate.subjectStabilized).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* parseBblParts / isStabCode                                           */
/* ------------------------------------------------------------------ */

describe("parseBblParts", () => {
  it("splits a 10-digit BBL into ACRIS parts", () => {
    expect(parseBblParts("2037980082")).toEqual({
      boro: "2",
      block: "3798",
      lot: "82",
    });
  });
  it("returns null for malformed input", () => {
    expect(parseBblParts("nope")).toBeNull();
    expect(parseBblParts("123")).toBeNull();
  });
});

describe("isStabCode", () => {
  it("flags 421-a and J-51 codes", () => {
    expect(isStabCode("5100")).toBe(true);
    expect(isStabCode("5114")).toBe(true);
    expect(isStabCode("5122")).toBe(true);
    expect(isStabCode("5129")).toBe(true);
    expect(isStabCode("5130")).toBe(true);
  });
  it("rejects other codes and junk", () => {
    expect(isStabCode("5131")).toBe(false);
    expect(isStabCode("1234")).toBe(false);
    expect(isStabCode(null)).toBe(false);
    expect(isStabCode("51")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* getLastArmsLengthDeed (mocked fetch)                                 */
/* ------------------------------------------------------------------ */

describe("getLastArmsLengthDeed", () => {
  it("picks the latest arm's-length DEED, skipping SAT/MTGE/nominal deeds", async () => {
    const seen: string[] = [];
    mockFetch((url: string) => {
      seen.push(url);
      if (url.includes("8h5j-fqxa"))
        return okJson([{ document_id: "A1" }, { document_id: "A2" }]);
      if (url.includes("bnx9-e6tj"))
        return okJson([
          {
            document_id: "A2",
            doc_type: "SAT",
            document_date: "2026-08-17T00:00:00.000",
            document_amt: "0",
          },
          {
            document_id: "A1",
            doc_type: "DEED",
            document_date: "2026-08-04T00:00:00.000",
            document_amt: "707500",
          },
          {
            document_id: "A3",
            doc_type: "DEED",
            document_date: "1983-01-04T00:00:00.000",
            document_amt: "0",
          },
        ]);
      throw new Error("unexpected URL " + url);
    });
    const anchor = await getLastArmsLengthDeed("2037980082");
    expect(anchor?.price).toBe(707500);
    expect(anchor?.date).toBe("2026-08-04");
    const legalsUrl = decodeURIComponent(seen[0]);
    expect(legalsUrl).toContain("8h5j-fqxa.json");
    expect(legalsUrl).toContain("borough=2");
  });

  it("returns null when no arm's-length deed exists", async () => {
    mockFetch((url: string) => {
      if (url.includes("8h5j-fqxa")) return okJson([{ document_id: "A1" }]);
      return okJson([
        {
          document_id: "A1",
          doc_type: "MTGE",
          document_date: "2020-01-01T00:00:00.000",
          document_amt: "500000",
        },
      ]);
    });
    expect(await getLastArmsLengthDeed("2037980082")).toBeNull();
  });

  it("returns null for a malformed BBL without fetching", async () => {
    const fn = mockFetch(() => okJson([]));
    expect(await getLastArmsLengthDeed("nope")).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* getStabilizedBbls (mocked fetch)                                     */
/* ------------------------------------------------------------------ */

describe("getStabilizedBbls", () => {
  it("returns BBLs carrying 421-a/J-51 benefits via parid", async () => {
    const seen: string[] = [];
    mockFetch((url: string) => {
      seen.push(url);
      return okJson([{ parid: "2025670010" }, { parid: "2025670020" }]);
    });
    const set = await getStabilizedBbls(["2025670010", "3001234567", "junk"]);
    expect(set.has("2025670010")).toBe(true);
    expect(set.has("3001234567")).toBe(false);
    const url = decodeURIComponent(seen[0]);
    expect(url).toContain("muvi-b6kx");
    expect(url).toContain("parid in(");
    expect(url).toContain("exmp_code>='5100'");
  });

  it("returns an empty set without fetching when no BBL is valid", async () => {
    const fn = mockFetch(() => okJson([]));
    expect((await getStabilizedBbls([])).size).toBe(0);
    expect((await getStabilizedBbls(["junk"])).size).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });
});
