/**
 * Property Insights — NYC public-data API clients.
 *
 * All network access for Stage 7 lives here. Every call has a timeout and
 * throws PropertyDataError (never returns half-parsed data). The UI maps
 * error codes to friendly messages; tests mock `fetch` so no live calls
 * happen in the test suite.
 *
 * Verified endpoints (2026-10-10):
 * - Geocoding: NYC Planning Labs Geosearch v2 (free, no key)
 * - PLUTO:      NYC Open Data Socrata dataset 64uk-42ks
 * - Sales:      NYC Open Data Socrata dataset w2pb-icbu (DOF annualized sales)
 *
 * Future migration: when the FastAPI backend is deployed, these calls should
 * move server-side (proxy + cache) — see STAGE7_NOTES.md. The function
 * signatures are designed to survive that move unchanged.
 */

import {
  normalizeBbl,
  normalizePlutoRecord,
  normalizeSaleRecord,
  toInsight,
} from "./normalize";
import type {
  PropertyInsight,
  PropertyProfile,
  SaleRecord,
} from "./types";

export const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/search";
export const PLUTO_URL = "https://data.cityofnewyork.us/resource/64uk-42ks.json";
export const SALES_URL = "https://data.cityofnewyork.us/resource/w2pb-icbu.json";

/** @internal — exported for tests. */
export const FETCH_TIMEOUT_MS = 12_000;
/** @internal — exported for tests. */
export const MAX_SALES = 5;

export type PropertyDataErrorCode =
  | "not-found" // geocoder returned no match
  | "no-pluto" // BBL not present in PLUTO
  | "timeout"
  | "http" // non-2xx from an API
  | "network" // fetch threw (offline, DNS, CORS…)
  | "parse"; // response wasn't usable JSON / wrong shape

export class PropertyDataError extends Error {
  code: PropertyDataErrorCode;
  constructor(code: PropertyDataErrorCode, message: string) {
    super(message);
    this.name = "PropertyDataError";
    this.code = code;
  }
}

/** @internal — exported for the home-worth module and tests. */
export async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    throw new PropertyDataError(
      timedOut ? "timeout" : "network",
      timedOut
        ? "The request timed out. Check your connection and try again."
        : "Couldn't reach the data service. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new PropertyDataError(
      "http",
      `The data service returned an error (HTTP ${res.status}). Try again in a moment.`,
    );
  }
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new PropertyDataError(
      "parse",
      "The data service returned an unexpected response. Try again.",
    );
  }
}

export interface GeocodeResult {
  /** 10-digit BBL. */
  bbl: string;
  /** Human label, e.g. "350 5 AVENUE, New York, NY, USA". */
  label: string;
  borough: string | null;
}

/**
 * Resolve a free-text NYC address to a BBL via Planning Labs Geosearch.
 * Returns null when nothing matches (caller maps to the "not-found" state).
 * When several candidates match, the first (best) is used.
 */
export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  const url =
    `${GEOSEARCH_URL}?text=${encodeURIComponent(address.trim())}&size=1`;
  const data = await fetchJson(url);
  const features = (data as { features?: unknown[] })?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const props = (features[0] as { properties?: Record<string, unknown> })
    ?.properties;
  const pad = (
    props?.addendum as { pad?: { bbl?: unknown } } | undefined
  )?.pad;
  const bbl = normalizeBbl(typeof pad?.bbl === "string" ? pad.bbl : null);
  if (!bbl) return null;
  return {
    bbl,
    label:
      typeof props?.label === "string" && props.label.trim() !== ""
        ? props.label
        : address.trim(),
    borough:
      typeof props?.borough === "string" ? props.borough : null,
  };
}

/**
 * Fetch the PLUTO record for a 10-digit BBL.
 * Returns null when the BBL isn't in PLUTO (caller → "no-pluto" state).
 */
export async function getPropertyProfile(
  bbl: string,
  displayAddress: string,
): Promise<PropertyProfile | null> {
  const url = `${PLUTO_URL}?bbl=${encodeURIComponent(bbl)}&$limit=1`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || data.length === 0) return null;
  return normalizePlutoRecord(
    data[0] as Record<string, unknown>,
    displayAddress,
  );
}

/**
 * Fetch recent sales for a 10-digit BBL, newest first.
 * $0 transfers (non-arm's-length) are excluded; up to MAX_SALES returned.
 * Never throws for empty results — returns [] instead.
 */
export async function getSaleHistory(bbl: string): Promise<SaleRecord[]> {
  const url =
    `${SALES_URL}?bbl=${encodeURIComponent(bbl)}` +
    `&$order=${encodeURIComponent("sale_date DESC")}&$limit=25`;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) return [];
  const sales: SaleRecord[] = [];
  for (const row of data) {
    const s = normalizeSaleRecord(row as Record<string, unknown>);
    if (s && s.price > 0) sales.push(s);
    if (sales.length >= MAX_SALES) break;
  }
  return sales;
}

/**
 * Full lookup pipeline: address → BBL → profile + sales (in parallel).
 * Throws PropertyDataError with code "not-found" / "no-pluto" for the
 * two expected empty states so the UI can render specific guidance.
 */
export async function lookupProperty(
  address: string,
): Promise<PropertyInsight> {
  if (!address.trim()) {
    throw new PropertyDataError("not-found", "Enter an address to look up.");
  }
  const geo = await geocodeAddress(address);
  if (!geo) {
    throw new PropertyDataError(
      "not-found",
      "We couldn't find that address. Check the spelling and include the borough (e.g. “350 5th Ave, Manhattan”).",
    );
  }
  const [profile, sales] = await Promise.all([
    getPropertyProfile(geo.bbl, geo.label),
    getSaleHistory(geo.bbl),
  ]);
  if (!profile) {
    throw new PropertyDataError(
      "no-pluto",
      "We found the address but it has no property record in PLUTO (it may be a very new development or a non-tax lot).",
    );
  }
  return toInsight(profile, sales);
}
