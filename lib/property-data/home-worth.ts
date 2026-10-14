/**
 * "What's My Home Worth?" — comparable-sales value estimator.
 *
 * Pipeline: address → BBL → PLUTO profile (subject facts) → tiered
 * comparable-sales search → time-adjusted median $/sqft × subject sqft →
 * value RANGE (midpoint ±10%), plus two enrichment signals:
 *
 * 1. ACRIS anchor — the subject's own last arm's-length deed (DOF/ACRIS
 *    Socrata tables 8h5j-fqxa → bnx9-e6tj), time-adjusted to current
 *    dollars. An appraiser weights the subject's own prior sale heavily;
 *    we show it as an anchor next to the comp median.
 * 2. Rent-stabilization flag — DOF tax-benefit records (dataset muvi-b6kx,
 *    421-a / J-51 exemption codes) imply rent-stabilized rents, which trade
 *    at a discount. The subject and each comp are flagged; a stabilized
 *    subject valued off free-market comps gets an explicit warning.
 *
 * Comp selection (the accuracy core):
 * - Tier ladder: exact building class + 12mo → exact class + 24mo →
 *   class letter + 12mo → class letter + 24mo → unfiltered + 24mo (the
 *   last tier is flagged low-confidence in the UI, never silent).
 * - Size band: comps must be within ±35% of the subject's building sqft
 *   ($/sqft is not constant across sizes — this was the systematic error
 *   behind "multifamily and single-family priced as similar").
 * - Two-pass outlier trim on time-adjusted $/sqft: drop comps outside
 *   [0.5×, 2×] the median (DOF rows contain nominal/distressed prices
 *   that clear the $1,000 floor, e.g. a verified $7,500 "sale").
 * - Market-conditions adjustment: every comp price is brought to current
 *   dollars with the FHFA purchase-only quarterly HPI for the
 *   New York-Jersey City-White Plains MSAD (bundled series in
 *   fhfa-hpi.json; refresh with scripts/update-fhfa-hpi.mjs).
 *
 * Methodology notes (also surfaced in the UI explainer):
 * - Comp $/sqft uses each sale row's `gross_square_feet` — the sqft the
 *   price was actually paid for. Values arrive comma-formatted ("3,096")
 *   and are parsed accordingly; comps missing sqft are skipped.
 * - $0 and nominal transfers (non-arm's-length, e.g. $10 LLC moves) are
 *   excluded; the two-pass trim catches the rest.
 * - Condo/co-op UNIT sales carry no sqft in the DOF data, so those property
 *   types usually land in the "not enough data" state — by design, we never
 *   fabricate a $/sqft. The UI routes those users to a manual CMA instead.
 *
 * All functions are pure except the `fetch`-based clients at the bottom;
 * tests mock `fetch` so no live calls happen in the test suite. The HPI
 * series is injectable (opts) so tests stay deterministic as the bundled
 * vintage moves forward.
 */

import {
  SALES_URL,
  fetchJson,
  geocodeAddress,
  getPropertyProfile,
  PropertyDataError,
} from "./client";
import { parseApiNumber } from "./normalize";
import type { PropertyProfile } from "./types";
import hpi from "./fhfa-hpi.json";

/** Minimum valid comps required for an estimate. */
export const MIN_COMPS = 3;
/** Comps shown in the UI list (all valid comps feed the median). */
export const MAX_COMPS_SHOWN = 8;
/** First-tier lookback window for comparable sales, in days. */
export const COMP_LOOKBACK_DAYS = 365;
/** Fallback-tier lookback window, in days (pairs with FHFA time adjustment). */
export const COMP_LOOKBACK_DAYS_WIDE = 730;
/** Range = midpoint ± this fraction. */
export const RANGE_FRACTION = 0.1;
/**
 * Prices below this are nominal transfers (e.g. $10 LLC moves), not
 * arm's-length sales — excluded from comps. Verified live 2026-10-10:
 * nominal $10 transfers are common in the DOF data.
 */
export const MIN_ARMS_LENGTH_PRICE = 1000;
/**
 * Comp size band: a comp's sqft must be within ± this fraction of the
 * subject's building sqft. $/sqft drifts with building size, so an
 * unbounded pool systematically misprices subjects that differ in size
 * from the typical comp.
 */
export const SQFT_BAND = 0.35;
/** Outlier trim bounds, as multiples of the median adjusted $/sqft. */
export const OUTLIER_LOW = 0.5;
export const OUTLIER_HIGH = 2.0;
/** Rows fetched per tier; size-band/outlier filtering happens in code. */
export const COMP_FETCH_LIMIT = 60;
/**
 * ACRIS deed amounts below this are nominal transfers, not sales.
 * Verified live 2026-10-13 (e.g. a $0 deed from 1983 next to a real
 * $707,500 deed on the same BBL).
 */
export const MIN_DEED_PRICE = 10000;

/** ACRIS + DOF exemption Socrata tables (verified live 2026-10-13). */
const ACRIS_LEGALS_URL = "https://data.cityofnewyork.us/resource/8h5j-fqxa.json";
const ACRIS_MASTER_URL = "https://data.cityofnewyork.us/resource/bnx9-e6tj.json";
const EXEMPT_URL = "https://data.cityofnewyork.us/resource/muvi-b6kx.json";

/**
 * DOF exemption codes whose presence implies rent stabilization:
 * 421-a family (5100–5122) and J-51 (5129–5130). Code ranges per NYC
 * housing-policy references; the codes themselves verified present in
 * the live dataset 2026-10-13.
 */
const STAB_CODE_RANGES: [string, string][] = [
  ["5100", "5122"],
  ["5129", "5130"],
];

/* ------------------------------------------------------------------ */
/* FHFA market-conditions adjustment                                    */
/* ------------------------------------------------------------------ */

interface FhfaBundle {
  vintage: string;
  place: string;
  source: string;
  series: Record<string, number>;
}

const HPI = hpi as FhfaBundle;
const HPI_SERIES: Record<string, number> = HPI.series;
const HPI_VINTAGE: string = HPI.vintage;

/** "2025-11-26T00:00:00.000" → "2025-Q4". Null for unparseable dates. */
export function saleQuarter(dateIso: string): string | null {
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

/**
 * Market-conditions multiplier bringing a past sale price to current
 * dollars: index(vintage) / index(sale quarter). Returns 1 when the sale
 * quarter is unknown, newer than the bundled vintage, or missing from
 * the series — never fabricate an adjustment.
 */
export function timeAdjustFactor(
  dateIso: string,
  series: Record<string, number> = HPI_SERIES,
  vintage: string = HPI_VINTAGE,
): number {
  const q = saleQuarter(dateIso);
  if (!q || q >= vintage) return 1;
  const then = series[q];
  const now = series[vintage];
  if (!then || !now || then <= 0 || now <= 0) return 1;
  return now / then;
}

/** "2026-Q2" → "Q2 2026" for display. */
export function hpiVintageLabel(vintage: string = HPI_VINTAGE): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(vintage);
  return m ? `Q${m[2]} ${m[1]}` : vintage;
}

/* ------------------------------------------------------------------ */
/* Small pure helpers (unchanged)                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse DOF's comma-formatted sqft strings ("3,096", "2,812,739").
 * Returns null for null/empty/non-numeric/non-positive input.
 */
export function parseSqft(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * First letter of a building class ("B2" → "B", "r4" → "R").
 * Returns null when there is no leading letter.
 */
export function classLetter(
  bldgclass: string | null | undefined,
): string | null {
  if (!bldgclass) return null;
  const m = /^[A-Za-z]/.exec(bldgclass.trim());
  return m ? m[0].toUpperCase() : null;
}

/** Human label for a building-class letter, used in the criteria note. */
export function classLetterLabel(letter: string | null): string {
  const map: Record<string, string> = {
    A: "one-family homes",
    B: "two-family homes",
    C: "walk-up apartment buildings",
    D: "elevator apartment buildings",
    R: "condos",
    O: "office buildings",
    S: "mixed-use buildings",
  };
  return (letter && map[letter]) || "similar buildings";
}

/** Median of a non-empty array; null for empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Round to the nearest $1,000. */
export function roundToNearest1k(n: number): number {
  return Math.round(n / 1000) * 1000;
}

/** "$735K" compact range formatting. */
export function formatRangeK(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n / 1000).toLocaleString("en-US") + "K";
}

/* ------------------------------------------------------------------ */
/* Comp normalization + market adjustment                               */
/* ------------------------------------------------------------------ */

/** One usable comparable sale. */
export interface CompSale {
  address: string;
  /** ISO date string from the API. */
  date: string;
  price: number;
  sqft: number;
  pricePerSqft: number;
  /** FHFA multiplier bringing the price to current dollars (1 = none). */
  adjustFactor: number;
  /** price × adjustFactor, rounded. */
  adjustedPrice: number;
  /** pricePerSqft × adjustFactor. */
  adjustedPricePerSqft: number;
  /** DOF tax-benefit record implying rent stabilization. */
  stabilized: boolean;
  /** 10-digit BBL when the sales row carries one. */
  bbl: string | null;
}

/**
 * Normalize one raw DOF sales row into a CompSale.
 * Returns null for nominal/missing prices, missing sqft, or bad dates —
 * these rows can never feed the median. Market adjustment is applied
 * separately by applyMarketAdjustment so tests can pin either stage.
 */
export function normalizeCompSale(
  raw: Record<string, unknown>,
): CompSale | null {
  const date =
    typeof raw.sale_date === "string" ? raw.sale_date.trim() : "";
  if (!date || Number.isNaN(Date.parse(date))) return null;
  const price = parseApiNumber(raw.sale_price);
  if (price === null || price < MIN_ARMS_LENGTH_PRICE) return null;
  const sqft = parseSqft(raw.gross_square_feet);
  if (sqft === null) return null;
  const address =
    typeof raw.address === "string" && raw.address.trim() !== ""
      ? raw.address.trim()
      : "—";
  const bbl =
    typeof raw.bbl === "string" && /^\d{10}$/.test(raw.bbl.trim())
      ? raw.bbl.trim()
      : null;
  const roundedPrice = Math.round(price);
  const roundedSqft = Math.round(sqft);
  return {
    address,
    date,
    price: roundedPrice,
    sqft: roundedSqft,
    pricePerSqft: price / sqft,
    adjustFactor: 1,
    adjustedPrice: roundedPrice,
    adjustedPricePerSqft: price / sqft,
    stabilized: false,
    bbl,
  };
}

/**
 * Bring every comp's price to current dollars via the FHFA HPI series.
 * Returns new objects; the input array is untouched.
 */
export function applyMarketAdjustment(
  comps: CompSale[],
  series: Record<string, number> = HPI_SERIES,
  vintage: string = HPI_VINTAGE,
): CompSale[] {
  return comps.map((c) => {
    const f = timeAdjustFactor(c.date, series, vintage);
    return {
      ...c,
      adjustFactor: f,
      adjustedPrice: Math.round(c.price * f),
      adjustedPricePerSqft: c.pricePerSqft * f,
    };
  });
}

/* ------------------------------------------------------------------ */
/* ACRIS deed anchor                                                    */
/* ------------------------------------------------------------------ */

/** The subject's own last arm's-length deed, time-adjusted. */
export interface DeedAnchor {
  price: number;
  /** YYYY-MM-DD. */
  date: string;
  adjustedPrice: number;
}

/** Split a 10-digit BBL into ACRIS Legals parts (boro/block/lot). */
export function parseBblParts(
  bbl: string,
): { boro: string; block: string; lot: string } | null {
  const m = /^(\d)(\d{5})(\d{4})$/.exec(bbl.trim());
  if (!m) return null;
  // ACRIS accepts unpadded block/lot (verified live 2026-10-13).
  return { boro: m[1], block: String(Number(m[2])), lot: String(Number(m[3])) };
}

/**
 * The subject's most recent arm's-length deed from ACRIS (Legals →
 * Master join). Returns null when there is none — enrichment is
 * best-effort and never blocks the comp estimate.
 */
export async function getLastArmsLengthDeed(
  bbl: string,
): Promise<DeedAnchor | null> {
  const parts = parseBblParts(bbl);
  if (!parts) return null;
  const legals = (await fetchJson(
    `${ACRIS_LEGALS_URL}?borough=${parts.boro}&block=${parts.block}&lot=${parts.lot}` +
      `&$order=${encodeURIComponent("good_through_date DESC")}&$limit=100`,
  )) as Record<string, unknown>[];
  if (!Array.isArray(legals) || legals.length === 0) return null;
  const ids = [
    ...new Set(
      legals
        .map((r) => r.document_id)
        .filter((v): v is string => typeof v === "string" && v !== ""),
    ),
  ];
  if (ids.length === 0) return null;
  const where = `document_id in(${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})`;
  const master = (await fetchJson(
    `${ACRIS_MASTER_URL}?$where=${encodeURIComponent(where)}` +
      `&$order=${encodeURIComponent("document_date DESC")}&$limit=${ids.length}`,
  )) as Record<string, unknown>[];
  if (!Array.isArray(master)) return null;
  for (const row of master) {
    if (row.doc_type !== "DEED") continue;
    const amt = parseApiNumber(row.document_amt);
    const date =
      typeof row.document_date === "string"
        ? row.document_date.slice(0, 10)
        : "";
    if (
      amt === null ||
      amt < MIN_DEED_PRICE ||
      !date ||
      Number.isNaN(Date.parse(date))
    )
      continue;
    const factor = timeAdjustFactor(date);
    return {
      price: Math.round(amt),
      date,
      adjustedPrice: Math.round(amt * factor),
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Rent-stabilization flag (DOF tax benefits)                           */
/* ------------------------------------------------------------------ */

/** True for 421-a-family / J-51 exemption codes. Exported for tests. */
export function isStabCode(code: unknown): boolean {
  if (typeof code !== "string" || !/^\d{4}$/.test(code)) return false;
  return STAB_CODE_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
}

/**
 * Which of the given BBLs carry a rent-stabilization-implying tax
 * benefit (421-a / J-51) in DOF's exemption file. One batched query;
 * returns the matching BBLs (parid == BBL, verified live 2026-10-13).
 */
export async function getStabilizedBbls(
  bbls: string[],
): Promise<Set<string>> {
  const clean = [...new Set(bbls.filter((b) => /^\d{10}$/.test(b)))];
  if (clean.length === 0) return new Set();
  const inList = clean.map((b) => `'${b}'`).join(",");
  const codeClause = STAB_CODE_RANGES.map(
    ([lo, hi]) => `(exmp_code>='${lo}' AND exmp_code<='${hi}')`,
  ).join(" OR ");
  const where = `parid in(${inList}) AND (${codeClause})`;
  const rows = (await fetchJson(
    `${EXEMPT_URL}?$where=${encodeURIComponent(where)}&$select=parid&$limit=${clean.length * 4}`,
  )) as Record<string, unknown>[];
  if (!Array.isArray(rows)) return new Set();
  return new Set(
    rows
      .map((r) => r.parid)
      .filter((v): v is string => typeof v === "string"),
  );
}

/* ------------------------------------------------------------------ */
/* Estimate pipeline                                                  */
/* ------------------------------------------------------------------ */

/** A successful estimate. */
export interface HomeWorthEstimate {
  subject: PropertyProfile;
  /** Adjusted median comp $/sqft × subject building sqft, rounded. */
  midpoint: number;
  /** Midpoint −10%, rounded to nearest $1k. */
  low: number;
  /** Midpoint +10%, rounded to nearest $1k. */
  high: number;
  /** Time-adjusted median comp $/sqft. */
  medianPricePerSqft: number;
  /** Valid comps feeding the median (newest first). */
  comps: CompSale[];
  /** Total valid comps found (may exceed comps shown). */
  compCount: number;
  /** Plain-language comp criteria, e.g. "one-family homes (class A5) in 10472, sold in the last 24 months". */
  criteriaNote: string;
  /** Lookback window (days) of the tier that produced this estimate. */
  windowDays: number;
  /** Class strictness of the tier that produced this estimate. */
  classTier: ClassTier;
  /** True when no class filter could be applied (flagged, never silent). */
  classUnfiltered: boolean;
  /** The subject's own last arm's-length deed, if found. */
  anchor: DeedAnchor | null;
  /** True when the subject carries a stabilization-implying tax benefit. */
  subjectStabilized: boolean;
  /** Comps in the pool carrying a stabilization-implying tax benefit. */
  stabilizedCompCount: number;
}

export type HomeWorthOutcome =
  | { ok: true; estimate: HomeWorthEstimate }
  | {
      ok: false;
      reason: "no-subject-sqft" | "few-comps";
      subject: PropertyProfile | null;
      /** Valid comps found (0 when the subject itself lacks sqft). */
      compsFound: number;
    };

/** Class strictness tier for the comp search. */
export type ClassTier = "exact" | "letter" | "none";

export interface EstimateOptions {
  stabilizedBbls?: Set<string>;
  windowDays?: number;
  classTier?: ClassTier;
  hpiSeries?: Record<string, number>;
  hpiVintage?: string;
}

/**
 * Pure estimate pipeline: subject profile + raw comp rows → outcome.
 * `compRows` should already be newest-first (the API orders them).
 */
export function estimateFromComps(
  subject: PropertyProfile,
  compRows: Record<string, unknown>[],
  opts: EstimateOptions = {},
): HomeWorthOutcome {
  const subjectSqft = subject.buildingSqft;
  if (!subjectSqft || subjectSqft <= 0) {
    return { ok: false, reason: "no-subject-sqft", subject, compsFound: 0 };
  }
  const series = opts.hpiSeries ?? HPI_SERIES;
  const vintage = opts.hpiVintage ?? HPI_VINTAGE;
  const windowDays = opts.windowDays ?? COMP_LOOKBACK_DAYS;
  const classTier: ClassTier = opts.classTier ?? "letter";
  const stabBbls = opts.stabilizedBbls ?? new Set<string>();

  // Normalize → market-adjust → size band → stabilization flags.
  const adjusted = applyMarketAdjustment(
    compRows.flatMap((row) => {
      const c = normalizeCompSale(row);
      return c ? [c] : [];
    }),
    series,
    vintage,
  );
  const inBand = adjusted.filter(
    (c) => Math.abs(c.sqft - subjectSqft) / subjectSqft <= SQFT_BAND,
  );
  for (const c of inBand) {
    c.stabilized = c.bbl !== null && stabBbls.has(c.bbl);
  }
  if (inBand.length < MIN_COMPS) {
    return { ok: false, reason: "few-comps", subject, compsFound: inBand.length };
  }

  // Two-pass outlier trim on adjusted $/sqft, then the final median.
  const firstMedian = median(inBand.map((c) => c.adjustedPricePerSqft));
  const trimmed =
    firstMedian === null
      ? inBand
      : inBand.filter(
          (c) =>
            c.adjustedPricePerSqft >= firstMedian * OUTLIER_LOW &&
            c.adjustedPricePerSqft <= firstMedian * OUTLIER_HIGH,
        );
  const pool = trimmed.length >= MIN_COMPS ? trimmed : inBand;
  const med = median(pool.map((c) => c.adjustedPricePerSqft));
  if (med === null || med <= 0) {
    return { ok: false, reason: "few-comps", subject, compsFound: inBand.length };
  }

  const midpoint = med * subjectSqft;
  const fullClass = (subject.buildingClass ?? "").trim().toUpperCase() || null;
  const letter = classLetter(subject.buildingClass);
  const zip = (subject.zipCode ?? "").slice(0, 5);
  const stabilizedCompCount = pool.filter((c) => c.stabilized).length;
  return {
    ok: true,
    estimate: {
      subject,
      midpoint: Math.round(midpoint),
      low: roundToNearest1k(midpoint * (1 - RANGE_FRACTION)),
      high: roundToNearest1k(midpoint * (1 + RANGE_FRACTION)),
      medianPricePerSqft: Math.round(med * 100) / 100,
      comps: pool.slice(0, MAX_COMPS_SHOWN),
      compCount: pool.length,
      criteriaNote: buildCriteriaNote(letter, fullClass, classTier, windowDays, zip),
      windowDays,
      classTier,
      classUnfiltered: classTier === "none",
      anchor: null, // filled by estimateHomeValue (needs ACRIS)
      subjectStabilized: stabBbls.has(subject.bbl),
      stabilizedCompCount,
    },
  };
}

function buildCriteriaNote(
  letter: string | null,
  fullClass: string | null,
  tier: ClassTier,
  windowDays: number,
  zip: string,
): string {
  const label = classLetterLabel(letter);
  const clsPart =
    tier === "exact" && fullClass
      ? ` (class ${fullClass})`
      : tier === "none"
        ? " (mixed building types — low confidence)"
        : "";
  const months = windowDays >= COMP_LOOKBACK_DAYS_WIDE ? "24 months" : "12 months";
  return `${label}${clsPart} in ${zip || "the area"}, sold in the last ${months}`;
}

/**
 * Fetch candidate comparable sales from the DOF dataset:
 * same ZIP + class tier filter + sold within the lookback window +
 * price > 0, newest first. Returns raw rows (normalization happens in
 * estimateFromComps). Never throws for empty results.
 */
export async function getComparableSales(
  zip: string,
  subjectClass: string | null,
  tier: ClassTier,
  sinceIso: string,
  limit = COMP_FETCH_LIMIT,
): Promise<Record<string, unknown>[]> {
  const clauses = [
    `zip_code='${zip}'`,
    `sale_price >= ${MIN_ARMS_LENGTH_PRICE}`,
    `sale_date >= '${sinceIso}'`,
  ];
  const full = (subjectClass ?? "").trim().toUpperCase() || null;
  const letter = classLetter(subjectClass);
  if (tier === "exact" && full) {
    clauses.push(`building_class_at_time_of='${full}'`);
  } else if (tier === "letter" && letter) {
    clauses.push(`starts_with(building_class_at_time_of,'${letter}')`);
  }
  const url =
    `${SALES_URL}?$where=${encodeURIComponent(clauses.join(" AND "))}` +
    `&$order=${encodeURIComponent("sale_date DESC")}&$limit=${limit}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) {
    throw new PropertyDataError(
      "parse",
      "The sales data came back in an unexpected shape. Try again.",
    );
  }
  return data as Record<string, unknown>[];
}

/**
 * Date-only (YYYY-MM-DD) lookback for the comp window (testable seam).
 * Date-only because the DOF `sale_date` column is a calendar_date — a full
 * ISO timestamp literal causes a SoQL type-mismatch (HTTP 400).
 */
export function lookbackIso(
  days: number = COMP_LOOKBACK_DAYS,
  nowMs: number = Date.now(),
): string {
  return new Date(nowMs - days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Full pipeline: address → BBL → PLUTO profile → tiered comparable-sales
 * search → estimate + ACRIS anchor + stabilization flags. Throws
 * PropertyDataError ("not-found" / "no-pluto") for the two expected empty
 * states; returns ok:false (never throws) when the data can't support an
 * estimate. Enrichment (ACRIS, exemptions) is best-effort: a failure
 * there degrades to null/false rather than failing the estimate.
 */
export async function estimateHomeValue(
  address: string,
  opts: { hpiSeries?: Record<string, number>; hpiVintage?: string } = {},
): Promise<HomeWorthOutcome> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new PropertyDataError("not-found", "Enter an address to get an estimate.");
  }
  const geo = await geocodeAddress(trimmed);
  if (!geo) {
    throw new PropertyDataError(
      "not-found",
      "We couldn't find that address. Check the spelling and include the borough (e.g. “35 Fordham Hill Oval, Bronx”).",
    );
  }
  const profile = await getPropertyProfile(geo.bbl, geo.label);
  if (!profile) {
    throw new PropertyDataError(
      "no-pluto",
      "We found the address but it has no property record in PLUTO (it may be a very new development or a non-tax lot).",
    );
  }
  const zip = /^\d{5}$/.test((profile.zipCode ?? "").slice(0, 5))
    ? (profile.zipCode as string).slice(0, 5)
    : null;
  if (!zip) {
    return { ok: false, reason: "few-comps", subject: profile, compsFound: 0 };
  }

  // Tier ladder: exact class + 12mo → exact class + 24mo →
  // class letter + 12mo → class letter + 24mo → unfiltered + 24mo.
  const fullClass = (profile.buildingClass ?? "").trim().toUpperCase() || null;
  const letter = classLetter(profile.buildingClass);
  const tiers: { tier: ClassTier; days: number }[] = [];
  if (fullClass) {
    tiers.push({ tier: "exact", days: COMP_LOOKBACK_DAYS });
    tiers.push({ tier: "exact", days: COMP_LOOKBACK_DAYS_WIDE });
  }
  if (letter) {
    tiers.push({ tier: "letter", days: COMP_LOOKBACK_DAYS });
    tiers.push({ tier: "letter", days: COMP_LOOKBACK_DAYS_WIDE });
  }
  tiers.push({ tier: "none", days: COMP_LOOKBACK_DAYS_WIDE });

  let best: HomeWorthOutcome = {
    ok: false,
    reason: "few-comps",
    subject: profile,
    compsFound: 0,
  };
  let winning: {
    rows: Record<string, unknown>[];
    tier: ClassTier;
    days: number;
  } | null = null;
  for (const t of tiers) {
    const rows = await getComparableSales(
      zip,
      profile.buildingClass,
      t.tier,
      lookbackIso(t.days),
    );
    const outcome = estimateFromComps(profile, rows, {
      windowDays: t.days,
      classTier: t.tier,
      hpiSeries: opts.hpiSeries,
      hpiVintage: opts.hpiVintage,
    });
    if (outcome.ok) {
      winning = { rows, tier: t.tier, days: t.days };
      break;
    }
    if (!outcome.ok && outcome.reason === "no-subject-sqft") {
      return outcome; // the subject itself lacks sqft — wider tiers can't help
    }
    if (
      !best.ok &&
      outcome.reason === "few-comps" &&
      outcome.compsFound > best.compsFound
    ) {
      best = outcome;
    }
  }
  if (!winning) return best;

  // Enrichment: stabilization flags (subject + comps, one batched query)
  // and the ACRIS deed anchor — best-effort, never fatal.
  const compBbls = [
    ...new Set(
      winning.rows
        .map((r) => (typeof r.bbl === "string" ? r.bbl : null))
        .filter((b): b is string => b !== null && /^\d{10}$/.test(b)),
    ),
  ];
  const [stabSet, anchor] = await Promise.all([
    getStabilizedBbls([geo.bbl, ...compBbls]).catch(() => new Set<string>()),
    getLastArmsLengthDeed(geo.bbl).catch(() => null),
  ]);

  const final = estimateFromComps(profile, winning.rows, {
    stabilizedBbls: stabSet,
    windowDays: winning.days,
    classTier: winning.tier,
    hpiSeries: opts.hpiSeries,
    hpiVintage: opts.hpiVintage,
  });
  if (!final.ok) return final;
  final.estimate.anchor = anchor;
  return final;
}
