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
  MIN_COMPS,
  classLetter,
  classLetterLabel,
  estimateFromComps,
  estimateHomeValue,
  formatRangeK,
  getComparableSales,
  lookbackIso,
  median,
  normalizeCompSale,
  parseSqft,
  roundToNearest1k,
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
    const out = estimateFromComps(subjectProfile(), rows);
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
    const out = estimateFromComps(subjectProfile(), rows);
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
    const out = estimateFromComps(subjectProfile(), rows);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.compCount).toBe(3);
  });

  it("returns few-comps when fewer than MIN_COMPS are valid", () => {
    const rows = [
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }),
    ];
    const out = estimateFromComps(subjectProfile(), rows);
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
    const out = estimateFromComps(subjectProfile(), rows);
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
  it("queries zip + class letter + date window, newest first", async () => {
    const seen: string[] = [];
    mockFetch((url: string) => {
      seen.push(url);
      return okJson([saleRow()]);
    });
    const rows = await getComparableSales("10467", "B", "2025-10-10T00:00:00.000");
    expect(rows).toHaveLength(1);
    const url = seen[0];
    expect(url).toContain("data.cityofnewyork.us/resource/w2pb-icbu.json");
    expect(decodeURIComponent(url)).toContain("zip_code='10467'");
    expect(decodeURIComponent(url)).toContain(
      "starts_with(building_class_at_time_of,'B')",
    );
    expect(decodeURIComponent(url)).toContain("sale_price >= 1000");
    expect(decodeURIComponent(url)).toContain("sale_date >=");
    expect(decodeURIComponent(url)).toContain("sale_date DESC");
  });

  it("omits the class filter when the letter is null", async () => {
    const seen: string[] = [];
    mockFetch((url: string) => {
      seen.push(url);
      return okJson([]);
    });
    const rows = await getComparableSales("10467", null, "2025-10-10T00:00:00.000");
    expect(rows).toEqual([]);
    expect(decodeURIComponent(seen[0])).not.toContain("starts_with");
  });

  it("throws PropertyDataError on a non-array payload", async () => {
    mockFetch(() => okJson({ not: "an array" }));
    await expect(
      getComparableSales("10467", "B", "2025-10-10T00:00:00.000"),
    ).rejects.toMatchObject({ name: "PropertyDataError", code: "parse" });
  });
});

describe("lookbackIso", () => {
  it("returns a date-only string ~365 days before now (calendar_date-safe)", () => {
    const now = new Date("2026-10-10T12:00:00.000Z").getTime();
    const iso = lookbackIso(now);
    expect(iso).toBe("2025-10-10");
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
      throw new Error("unexpected URL " + url);
    });
  }

  it("runs the full pipeline to an estimate", async () => {
    mockPipeline([
      saleRow({ sale_price: "960000", gross_square_feet: "2,400" }),
      saleRow({ sale_price: "1000000", gross_square_feet: "2,000" }),
      saleRow({ sale_price: "1440000", gross_square_feet: "2,400" }),
    ]);
    const out = await estimateHomeValue("123 Example St, Bronx");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.midpoint).toBe(1200000);
    expect(out.estimate.low).toBe(1080000);
    expect(out.estimate.high).toBe(1320000);
    expect(out.estimate.subject.bbl).toBe("2025670010");
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
    const out = await estimateHomeValue("123 Example St, Bronx");
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
    const out = await estimateHomeValue("123 Example St, Bronx");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no-subject-sqft");
  });

  it("requires at least MIN_COMPS valid comps", () => {
    expect(MIN_COMPS).toBe(3);
  });
});
