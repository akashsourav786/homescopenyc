/**
 * Property Insights — unit tests for the data layer.
 *
 * NO live API calls here: pure functions are tested directly and the API
 * clients run against a mocked `fetch`. Fixture data mirrors the real
 * response shapes verified on 2026-10-10.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SALES,
  geocodeAddress,
  getPropertyProfile,
  getSaleHistory,
  lookupProperty,
} from "./client";
import {
  boroughName,
  compareStats,
  formatCount,
  formatDate,
  formatMoney,
  landUseLabel,
  normalizeBbl,
  normalizePlutoRecord,
  normalizeSaleRecord,
  parseApiNumber,
  toInsight,
} from "./normalize";
import type { PropertyProfile } from "./types";

/** Real PLUTO row shape for 350 5th Ave (BBL 1008350041), trimmed. */
const EMPIRE_PLUTO = {
  bbl: "1008350041.00000000",
  borough: "MN",
  block: "835",
  lot: "41",
  address: "338 5 AVENUE",
  bldgclass: "O4",
  landuse: "5",
  yearbuilt: "1931",
  numfloors: "102.0000000",
  unitsres: "0",
  unitstotal: "513",
  lotarea: "91351",
  bldgarea: "2812739",
  assesstot: "577440900.00000",
  zonedist1: "C5-3",
  zonedist2: "C6-4.5",
  zonedist3: "",
  ownername: "ESRT EMPIRE STATE BUILDING, L.L.C.",
  zipcode: "10001",
};

const mockFetch = (impl: (url: string) => unknown) => {
  const fn = vi.fn(async (url: string) => impl(url));
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("normalizeBbl", () => {
  it("accepts a plain 10-digit BBL", () => {
    expect(normalizeBbl("1008350041")).toBe("1008350041");
  });
  it("accepts PLUTO's float-formatted BBL", () => {
    expect(normalizeBbl("1008350041.00000000")).toBe("1008350041");
  });
  it("rejects short or malformed input", () => {
    expect(normalizeBbl("183541")).toBeNull();
    expect(normalizeBbl("")).toBeNull();
    expect(normalizeBbl(null)).toBeNull();
    expect(normalizeBbl("not-a-bbl!!")).toBeNull();
  });
  it("rejects 10+ digit strings with non-zero tails", () => {
    expect(normalizeBbl("10083500411234")).toBeNull();
  });
});

describe("parseApiNumber", () => {
  it("parses float-formatted strings", () => {
    expect(parseApiNumber("102.0000000")).toBe(102);
    expect(parseApiNumber("91351")).toBe(91351);
    expect(parseApiNumber("577440900.00000")).toBe(577440900);
  });
  it("returns null for null/empty/junk", () => {
    expect(parseApiNumber(null)).toBeNull();
    expect(parseApiNumber("")).toBeNull();
    expect(parseApiNumber("   ")).toBeNull();
    expect(parseApiNumber("abc")).toBeNull();
    expect(parseApiNumber(undefined)).toBeNull();
  });
});

describe("boroughName", () => {
  it("maps PLUTO codes", () => {
    expect(boroughName("MN")).toBe("Manhattan");
    expect(boroughName("BK")).toBe("Brooklyn");
  });
  it("maps DOF numeric codes", () => {
    expect(boroughName("1")).toBe("Manhattan");
    expect(boroughName("3")).toBe("Brooklyn");
  });
  it("never crashes on unknown input", () => {
    expect(boroughName("XX")).toBe("Unknown borough");
    expect(boroughName(null)).toBe("Unknown borough");
  });
});

describe("landUseLabel", () => {
  it("maps known codes", () => {
    expect(landUseLabel("5")).toBe("Commercial & Office Buildings");
    expect(landUseLabel("1")).toBe("One & Two Family Buildings");
  });
  it("handles unknown/empty", () => {
    expect(landUseLabel("99")).toBe("Land use code 99");
    expect(landUseLabel(null)).toBeNull();
    expect(landUseLabel("")).toBeNull();
  });
});

describe("normalizePlutoRecord", () => {
  it("normalizes the Empire State Building record", () => {
    const p = normalizePlutoRecord(EMPIRE_PLUTO, "350 5 AVENUE, New York, NY, USA");
    expect(p).not.toBeNull();
    expect(p!.bbl).toBe("1008350041");
    expect(p!.borough).toBe("Manhattan");
    expect(p!.block).toBe("835");
    expect(p!.lot).toBe("41");
    expect(p!.buildingClass).toBe("O4");
    expect(p!.landUse).toBe("Commercial & Office Buildings");
    expect(p!.yearBuilt).toBe(1931);
    expect(p!.stories).toBe(102);
    expect(p!.totalUnits).toBe(513);
    expect(p!.lotSqft).toBe(91351);
    expect(p!.buildingSqft).toBe(2812739);
    expect(p!.assessedValue).toBe(577440900);
    expect(p!.zoning).toEqual(["C5-3", "C6-4.5"]);
    expect(p!.zipCode).toBe("10001");
  });
  it("returns null without a valid BBL", () => {
    expect(normalizePlutoRecord({ bbl: "junk" }, "x")).toBeNull();
    expect(normalizePlutoRecord({}, "x")).toBeNull();
  });
});

describe("normalizeSaleRecord", () => {
  it("parses a valid sale", () => {
    const s = normalizeSaleRecord({
      sale_date: "2025-05-13T00:00:00.000",
      sale_price: "1800000",
      address: "50 FRANKLIN STREET, S9A",
    });
    expect(s).toEqual({
      date: "2025-05-13T00:00:00.000",
      price: 1800000,
      address: "50 FRANKLIN STREET, S9A",
    });
  });
  it("keeps $0 transfers (client filters them)", () => {
    const s = normalizeSaleRecord({
      sale_date: "2025-11-22T00:00:00.000",
      sale_price: "0",
      address: "50 FRANKLIN STREET, S30B",
    });
    expect(s?.price).toBe(0);
  });
  it("returns null for bad date or price", () => {
    expect(
      normalizeSaleRecord({ sale_date: "not-a-date", sale_price: "100" }),
    ).toBeNull();
    expect(
      normalizeSaleRecord({ sale_date: "2025-01-01T00:00:00.000" }),
    ).toBeNull();
  });
});

describe("formatters", () => {
  it("formatMoney", () => {
    expect(formatMoney(1800000)).toBe("$1,800,000");
    expect(formatMoney(null)).toBe("—");
  });
  it("formatCount", () => {
    expect(formatCount(91351)).toBe("91,351");
    expect(formatCount(null)).toBe("—");
  });
  it("formatDate uses UTC (no off-by-one)", () => {
    expect(formatDate("2025-05-13T00:00:00.000")).toBe("May 13, 2025");
    expect(formatDate("garbage")).toBe("—");
    expect(formatDate(null)).toBe("—");
  });
});

function miniProfile(over: Partial<PropertyProfile>): PropertyProfile {
  return {
    bbl: "1000000001",
    displayAddress: "1 TEST ST",
    borough: "Manhattan",
    block: "1",
    lot: "1",
    buildingClass: null,
    landUse: null,
    yearBuilt: null,
    stories: null,
    residentialUnits: null,
    totalUnits: null,
    lotSqft: null,
    buildingSqft: null,
    assessedValue: null,
    zoning: [],
    ownerName: null,
    zipCode: null,
    ...over,
  };
}

describe("compareStats", () => {
  const a = miniProfile({
    yearBuilt: 1931,
    stories: 102,
    assessedValue: 577440900,
  });
  const b = miniProfile({
    yearBuilt: 2007,
    stories: 10,
    assessedValue: 10000000,
  });
  it("marks newer/higher sides", () => {
    const rows = compareStats(a, b, null, null);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.yearBuilt.higher).toBe("b");
    expect(by.yearBuilt.isYear).toBe(true);
    expect(by.stories.higher).toBe("a");
    expect(by.assessedValue.higher).toBe("a");
    expect(by.assessedValue.a).toBe("$577,440,900");
  });
  it("marks ties and missing data", () => {
    const rows = compareStats(
      miniProfile({ stories: 10 }),
      miniProfile({ stories: 10 }),
      null,
      null,
    );
    expect(rows.find((r) => r.key === "stories")!.higher).toBe("tie");
    expect(rows.find((r) => r.key === "lotSqft")!.higher).toBeNull();
    expect(rows.find((r) => r.key === "lotSqft")!.a).toBe("—");
  });
  it("compares last sale prices", () => {
    const rows = compareStats(
      a,
      b,
      { date: "2020-01-01T00:00:00.000", price: 500000, address: "A" },
      { date: "2021-01-01T00:00:00.000", price: 900000, address: "B" },
    );
    const last = rows.find((r) => r.key === "lastSale")!;
    expect(last.higher).toBe("b");
    expect(last.a).toBe("$500,000");
  });
});

describe("toInsight", () => {
  it("attaches lastSale from the first sale", () => {
    const p = miniProfile({});
    const sales = [
      { date: "2021-01-01T00:00:00.000", price: 9, address: "B" },
      { date: "2020-01-01T00:00:00.000", price: 5, address: "A" },
    ];
    const insight = toInsight(p, sales);
    expect(insight.lastSale?.price).toBe(9);
    expect(toInsight(p, []).lastSale).toBeNull();
  });
});

/* ---------------- API clients (mocked fetch) ---------------- */

const GEO_JSON = {
  type: "FeatureCollection",
  features: [
    {
      properties: {
        label: "350 5 AVENUE, New York, NY, USA",
        borough: "Manhattan",
        addendum: { pad: { bbl: "1008350041", bin: "1015862" } },
      },
    },
  ],
};

const okResponse = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => data,
  }) as Response;

describe("geocodeAddress", () => {
  it("returns BBL + label on success", async () => {
    mockFetch(() => okResponse(GEO_JSON));
    const r = await geocodeAddress("350 5th Ave, New York, NY");
    expect(r?.bbl).toBe("1008350041");
    expect(r?.label).toBe("350 5 AVENUE, New York, NY, USA");
  });
  it("returns null when nothing matches", async () => {
    mockFetch(() => okResponse({ type: "FeatureCollection", features: [] }));
    expect(await geocodeAddress("asdf qwer zxcv")).toBeNull();
  });
  it("maps AbortError to the timeout code", async () => {
    mockFetch(() => {
      const e = new Error("aborted");
      e.name = "AbortError";
      return Promise.reject(e);
    });
    await expect(geocodeAddress("350 5th Ave")).rejects.toMatchObject({
      code: "timeout",
    });
  });
  it("throws http on non-2xx", async () => {
    mockFetch(
      () => ({ ok: false, status: 500, json: async () => ({}) }) as Response,
    );
    await expect(geocodeAddress("350 5th Ave")).rejects.toMatchObject({
      code: "http",
    });
  });
});

describe("getPropertyProfile", () => {
  it("normalizes the first PLUTO row", async () => {
    mockFetch(() => okResponse([EMPIRE_PLUTO]));
    const p = await getPropertyProfile("1008350041", "350 5 AVE");
    expect(p?.bbl).toBe("1008350041");
    expect(p?.displayAddress).toBe("350 5 AVE");
    expect(p?.stories).toBe(102);
  });
  it("returns null when PLUTO has no row", async () => {
    mockFetch(() => okResponse([]));
    expect(await getPropertyProfile("1000000001", "x")).toBeNull();
  });
});

describe("getSaleHistory", () => {
  const rows = [
    { sale_date: "2025-11-22T00:00:00.000", sale_price: "0", address: "X" },
    { sale_date: "2025-05-13T00:00:00.000", sale_price: "1800000", address: "A" },
    { sale_date: "2019-06-21T00:00:00.000", sale_price: "1590000", address: "B" },
  ];
  it("excludes $0 transfers and keeps newest-first order", async () => {
    mockFetch(() => okResponse(rows));
    const s = await getSaleHistory("1001727504");
    expect(s.map((x) => x.price)).toEqual([1800000, 1590000]);
  });
  it("caps at MAX_SALES", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      sale_date: `2020-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000`,
      sale_price: `${100000 + i}`,
      address: "X",
    }));
    mockFetch(() => okResponse(many));
    expect((await getSaleHistory("1001727504")).length).toBe(MAX_SALES);
  });
  it("returns [] for empty or malformed payloads", async () => {
    mockFetch(() => okResponse([]));
    expect(await getSaleHistory("1001727504")).toEqual([]);
    mockFetch(() => okResponse({ not: "an array" }));
    expect(await getSaleHistory("1001727504")).toEqual([]);
  });
});

describe("lookupProperty", () => {
  it("throws not-found when geocoding misses", async () => {
    mockFetch(() => okResponse({ type: "FeatureCollection", features: [] }));
    await expect(lookupProperty("asdf qwer")).rejects.toMatchObject({
      code: "not-found",
    });
  });
  it("throws no-pluto when PLUTO has no row", async () => {
    mockFetch((url: string) =>
      okResponse(url.includes("planninglabs") ? GEO_JSON : []),
    );
    await expect(lookupProperty("350 5th Ave")).rejects.toMatchObject({
      code: "no-pluto",
    });
  });
  it("returns profile + sales on the happy path", async () => {
    mockFetch((url: string) =>
      okResponse(
        url.includes("planninglabs")
          ? GEO_JSON
          : url.includes("64uk-42ks")
            ? [EMPIRE_PLUTO]
            : [
                {
                  sale_date: "2025-05-13T00:00:00.000",
                  sale_price: "1800000",
                  address: "50 FRANKLIN STREET, S9A",
                },
              ],
      ),
    );
    const insight = await lookupProperty("350 5th Ave, New York, NY");
    expect(insight.profile.bbl).toBe("1008350041");
    expect(insight.lastSale?.price).toBe(1800000);
  });
});
