/**
 * Property Insights — pure normalization functions.
 *
 * Every function here is a pure function of its inputs (no fetch, no React),
 * so the mapping from messy API rows to clean UI types is fully unit-
 * testable without network access. See property-data.test.ts.
 */

import type {
  CompareStat,
  PropertyInsight,
  PropertyProfile,
  SaleRecord,
} from "./types";

/**
 * Normalize a raw BBL to its 10-digit form.
 *
 * Accepts "1008350041" and PLUTO's float-formatted "1008350041.00000000".
 * Returns null for anything else (wrong length, non-numeric junk).
 */
export function normalizeBbl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  // PLUTO returns the BBL as a float string ("1008350041.00000000"):
  // accept it only when the trailing digits are all zeros.
  if (digits.length > 10) {
    const head = digits.slice(0, 10);
    const tail = digits.slice(10);
    if (/^0+$/.test(tail)) return head;
  }
  return null;
}

/**
 * Parse the API's float-formatted numeric strings ("102.0000000", "91351").
 * Returns null for null/empty/non-numeric input — never NaN.
 */
export function parseApiNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Map PLUTO borough codes ("MN") and DOF numeric codes ("1") to names. */
export function boroughName(code: string | null | undefined): string {
  const map: Record<string, string> = {
    MN: "Manhattan",
    BX: "The Bronx",
    BK: "Brooklyn",
    QN: "Queens",
    SI: "Staten Island",
    "1": "Manhattan",
    "2": "The Bronx",
    "3": "Brooklyn",
    "4": "Queens",
    "5": "Staten Island",
  };
  if (!code) return "Unknown borough";
  return map[String(code).trim().toUpperCase()] ?? "Unknown borough";
}

/** PLUTO landuse codes → human labels. */
export function landUseLabel(code: string | null | undefined): string | null {
  const map: Record<string, string> = {
    "1": "One & Two Family Buildings",
    "2": "Multi-Family Walk-Up Buildings",
    "3": "Multi-Family Elevator Buildings",
    "4": "Mixed Residential & Commercial",
    "5": "Commercial & Office Buildings",
    "6": "Industrial & Manufacturing",
    "7": "Transportation & Utility",
    "8": "Public Facilities & Institutions",
    "9": "Open Space & Outdoor Recreation",
    "10": "Parking Facilities",
    "11": "Vacant Land",
  };
  if (code === null || code === undefined) return null;
  const key = String(code).trim();
  if (key === "") return null;
  return map[key] ?? `Land use code ${key}`;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/**
 * Normalize one raw PLUTO row into a PropertyProfile.
 * Returns null when the row has no valid BBL (nothing to key on).
 */
export function normalizePlutoRecord(
  raw: Record<string, unknown>,
  displayAddress: string,
): PropertyProfile | null {
  const bbl = normalizeBbl(
    typeof raw.bbl === "string" ? raw.bbl : String(raw.bbl ?? ""),
  );
  if (!bbl) return null;

  const intOrNull = (v: unknown): number | null => {
    const n = parseApiNumber(v);
    return n === null ? null : Math.round(n);
  };

  const zoning: string[] = [];
  for (const key of ["zonedist1", "zonedist2", "zonedist3", "zonedist4"]) {
    const z = nonEmptyString(raw[key]);
    if (z) zoning.push(z);
  }

  return {
    bbl,
    displayAddress,
    borough: boroughName(
      typeof raw.borough === "string" ? raw.borough : null,
    ),
    block: nonEmptyString(raw.block) ?? "—",
    lot: nonEmptyString(raw.lot) ?? "—",
    buildingClass: nonEmptyString(raw.bldgclass),
    landUse: landUseLabel(
      raw.landuse === null || raw.landuse === undefined
        ? null
        : String(raw.landuse),
    ),
    yearBuilt: intOrNull(raw.yearbuilt),
    stories: intOrNull(raw.numfloors),
    residentialUnits: intOrNull(raw.unitsres),
    totalUnits: intOrNull(raw.unitstotal),
    lotSqft: intOrNull(raw.lotarea),
    buildingSqft: intOrNull(raw.bldgarea),
    assessedValue: intOrNull(raw.assesstot),
    zoning,
    ownerName: nonEmptyString(raw.ownername),
    zipCode: nonEmptyString(raw.zipcode),
  };
}

/**
 * Normalize one raw DOF sales row into a SaleRecord.
 * Returns null when the date is missing/unparseable or the price is missing.
 * Note: $0 prices (non-arm's-length transfers) are kept here — the client
 * filters them out of the displayed history.
 */
export function normalizeSaleRecord(
  raw: Record<string, unknown>,
): SaleRecord | null {
  const date = nonEmptyString(raw.sale_date);
  const price = parseApiNumber(raw.sale_price);
  if (!date || price === null || Number.isNaN(Date.parse(date))) return null;
  return {
    date,
    price: Math.round(price),
    address: nonEmptyString(raw.address) ?? "—",
  };
}

/** "$1,800,000" — "—" for null. */
export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** "1,234" sqft-style formatting — "—" for null. */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** "May 13, 2025" (UTC, to avoid off-by-one) — "—" for bad input. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface StatDef {
  key: string;
  label: string;
  get: (p: PropertyProfile) => number | null;
  isYear?: boolean;
}

/** Stats compared side-by-side in compare mode. */
const COMPARE_STATS: StatDef[] = [
  { key: "yearBuilt", label: "Year built", get: (p) => p.yearBuilt, isYear: true },
  { key: "stories", label: "Stories", get: (p) => p.stories },
  { key: "totalUnits", label: "Total units", get: (p) => p.totalUnits },
  { key: "lotSqft", label: "Lot sq ft", get: (p) => p.lotSqft },
  { key: "buildingSqft", label: "Building sq ft", get: (p) => p.buildingSqft },
  { key: "assessedValue", label: "Assessed value", get: (p) => p.assessedValue },
];

/**
 * Build the side-by-side stat rows for compare mode.
 * `higher` marks which side is numerically larger ("newer" for year built);
 * null when either side is missing, "tie" when equal.
 */
export function compareStats(
  a: PropertyProfile,
  b: PropertyProfile,
  lastSaleA: SaleRecord | null,
  lastSaleB: SaleRecord | null,
): CompareStat[] {
  const rows: CompareStat[] = COMPARE_STATS.map((def) => {
    const va = def.get(a);
    const vb = def.get(b);
    let higher: CompareStat["higher"] = null;
    if (va !== null && vb !== null) {
      higher = va === vb ? "tie" : va > vb ? "a" : "b";
    }
    const fmt = def.key === "assessedValue" ? formatMoney : formatCount;
    return {
      key: def.key,
      label: def.label,
      a: va === null ? "—" : def.isYear ? String(va) : fmt(va),
      b: vb === null ? "—" : def.isYear ? String(vb) : fmt(vb),
      higher,
      isYear: def.isYear,
    };
  });

  // Last sale price, appended after the PLUTO stats.
  const pa = lastSaleA?.price ?? null;
  const pb = lastSaleB?.price ?? null;
  let higher: CompareStat["higher"] = null;
  if (pa !== null && pb !== null) {
    higher = pa === pb ? "tie" : pa > pb ? "a" : "b";
  }
  rows.push({
    key: "lastSale",
    label: "Last sale price",
    a: formatMoney(pa),
    b: formatMoney(pb),
    higher,
  });
  return rows;
}

/** Convenience: attach sales to a profile for the single-mode result. */
export function toInsight(
  profile: PropertyProfile,
  sales: SaleRecord[],
): PropertyInsight {
  return { profile, sales, lastSale: sales[0] ?? null };
}
