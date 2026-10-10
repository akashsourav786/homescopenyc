/**
 * "What's My Home Worth?" — comparable-sales value estimator.
 *
 * Pipeline: address → BBL → PLUTO profile (subject facts) → recent nearby
 * closed sales (same ZIP + same building-class letter, last 365 days) →
 * median $/sqft × subject building sqft → value RANGE (midpoint ±10%).
 *
 * Methodology notes (also surfaced in the UI explainer):
 * - Comp $/sqft uses each sale row's `gross_square_feet` — the sqft the
 *   price was actually paid for. (An earlier plan considered a batched
 *   PLUTO lookup for comp sqft; the sales record's own figure is more
 *   correct and avoids a second query.) Values arrive comma-formatted
 *   ("3,096") and are parsed accordingly; comps missing sqft are skipped.
 * - Building-class match = same FIRST LETTER of the DOF building class
 *   (e.g. subject "B2" matches comp sales with class "B1"…"B9"). Verified
 *   against live data 2026-10-10: A*→one-family, B*→two-family, C*→walk-ups,
 *   D*→elevator/co-op, R*→condos. The sales dataset's category labels have
 *   inconsistent spacing, so the letter prefix is the reliable key.
 * - $0 and nominal transfers (non-arm's-length, e.g. $10 LLC moves) are
 *   excluded — verified live that nominal transfers are common in the data.
 * - Condo/co-op UNIT sales carry no sqft in the DOF data, so those property
 *   types usually land in the "not enough data" state — by design, we never
 *   fabricate a $/sqft. The UI routes those users to a manual CMA instead.
 *
 * All functions are pure except the two `fetch`-based clients at the bottom;
 * tests mock `fetch` so no live calls happen in the test suite.
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

/** Minimum valid comps required for an estimate. */
export const MIN_COMPS = 3;
/** Comps shown in the UI list (all valid comps feed the median). */
export const MAX_COMPS_SHOWN = 8;
/** Lookback window for comparable sales, in days. */
export const COMP_LOOKBACK_DAYS = 365;
/** Range = midpoint ± this fraction. */
export const RANGE_FRACTION = 0.1;
/**
 * Prices below this are nominal transfers (e.g. $10 LLC moves), not
 * arm's-length sales — excluded from comps. Verified live 2026-10-10:
 * nominal $10 transfers are common in the DOF data.
 */
export const MIN_ARMS_LENGTH_PRICE = 1000;

/** One usable comparable sale. */
export interface CompSale {
  address: string;
  /** ISO date string from the API. */
  date: string;
  price: number;
  sqft: number;
  pricePerSqft: number;
}

/** A successful estimate. */
export interface HomeWorthEstimate {
  subject: PropertyProfile;
  /** Median comp $/sqft × subject building sqft, rounded to the dollar. */
  midpoint: number;
  /** Midpoint −10%, rounded to nearest $1k. */
  low: number;
  /** Midpoint +10%, rounded to nearest $1k. */
  high: number;
  medianPricePerSqft: number;
  /** Valid comps feeding the median (newest first). */
  comps: CompSale[];
  /** Total valid comps found (may exceed comps shown). */
  compCount: number;
  /** Plain-language comp criteria, e.g. "two-family homes in 10314". */
  criteriaNote: string;
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

/**
 * Normalize one raw DOF sales row into a CompSale.
 * Returns null for nominal/missing prices, missing sqft, or bad dates —
 * these rows can never feed the median.
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
  return {
    address,
    date,
    price: Math.round(price),
    sqft: Math.round(sqft),
    pricePerSqft: price / sqft,
  };
}

/**
 * Pure estimate pipeline: subject profile + raw comp rows → outcome.
 * `compRows` should already be newest-first (the API orders them).
 */
export function estimateFromComps(
  subject: PropertyProfile,
  compRows: Record<string, unknown>[],
): HomeWorthOutcome {
  const subjectSqft = subject.buildingSqft;
  if (!subjectSqft || subjectSqft <= 0) {
    return { ok: false, reason: "no-subject-sqft", subject, compsFound: 0 };
  }
  const comps: CompSale[] = [];
  for (const row of compRows) {
    const c = normalizeCompSale(row);
    if (c) comps.push(c);
  }
  if (comps.length < MIN_COMPS) {
    return { ok: false, reason: "few-comps", subject, compsFound: comps.length };
  }
  const med = median(comps.map((c) => c.pricePerSqft));
  if (med === null || med <= 0) {
    return { ok: false, reason: "few-comps", subject, compsFound: comps.length };
  }
  const midpoint = med * subjectSqft;
  const letter = classLetter(subject.buildingClass);
  const zip = (subject.zipCode ?? "").slice(0, 5);
  return {
    ok: true,
    estimate: {
      subject,
      midpoint: Math.round(midpoint),
      low: roundToNearest1k(midpoint * (1 - RANGE_FRACTION)),
      high: roundToNearest1k(midpoint * (1 + RANGE_FRACTION)),
      medianPricePerSqft: Math.round(med * 100) / 100,
      comps: comps.slice(0, MAX_COMPS_SHOWN),
      compCount: comps.length,
      criteriaNote: `${classLetterLabel(letter)} in ${zip || "the area"}, sold in the last 12 months`,
    },
  };
}

/**
 * Fetch candidate comparable sales from the DOF dataset:
 * same ZIP + same building-class letter + sold within the lookback window +
 * price > 0, newest first. Returns raw rows (normalization happens in
 * estimateFromComps). Never throws for empty results.
 */
export async function getComparableSales(
  zip: string,
  letter: string | null,
  sinceIso: string,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  const clauses = [
    `zip_code='${zip}'`,
    `sale_price >= ${MIN_ARMS_LENGTH_PRICE}`,
    `sale_date >= '${sinceIso}'`,
  ];
  if (letter) {
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

/** Date-only (YYYY-MM-DD) lookback for the comp window (testable seam).
 * Date-only because the DOF `sale_date` column is a calendar_date — a full
 * ISO timestamp literal causes a SoQL type-mismatch (HTTP 400). */
export function lookbackIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - COMP_LOOKBACK_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Full pipeline: address → BBL → PLUTO profile → comparable sales →
 * estimate. Throws PropertyDataError ("not-found" / "no-pluto") for the two
 * expected empty states; returns ok:false (never throws) when the data can't
 * support an estimate.
 */
export async function estimateHomeValue(
  address: string,
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
  const rows = await getComparableSales(
    zip,
    classLetter(profile.buildingClass),
    lookbackIso(),
  );
  return estimateFromComps(profile, rows);
}
