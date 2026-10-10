/**
 * Property Insights — shared types for the NYC public-data lookup.
 *
 * Raw API rows (Geosearch / PLUTO / DOF sales) are normalized into these
 * clean shapes by the pure functions in `normalize.ts`. The UI only ever
 * touches these types, never raw API payloads.
 */

/** Clean, UI-ready property profile normalized from a PLUTO record. */
export interface PropertyProfile {
  /** 10-digit BBL (borough-block-lot), e.g. "1008350041". */
  bbl: string;
  /** Human-readable address from geocoding, e.g. "350 5 AVENUE, New York, NY, USA". */
  displayAddress: string;
  /** Borough name, e.g. "Manhattan". */
  borough: string;
  block: string;
  lot: string;
  buildingClass: string | null;
  /** Human land-use label, e.g. "Commercial & Office". */
  landUse: string | null;
  yearBuilt: number | null;
  /** Number of floors. */
  stories: number | null;
  residentialUnits: number | null;
  totalUnits: number | null;
  lotSqft: number | null;
  buildingSqft: number | null;
  /** PLUTO assessed total value (actual, not market). */
  assessedValue: number | null;
  zoning: string[];
  ownerName: string | null;
  zipCode: string | null;
}

/** One recorded sale from the DOF annualized sales dataset. */
export interface SaleRecord {
  /** ISO date string from the API, e.g. "2025-05-13T00:00:00.000". */
  date: string;
  price: number;
  address: string;
}

/** Full lookup result: profile + recent arm's-length sales. */
export interface PropertyInsight {
  profile: PropertyProfile;
  /** Up to 5 most recent sales with price > 0, newest first. */
  sales: SaleRecord[];
  /** Most recent sale, or null when there are none. */
  lastSale: SaleRecord | null;
}

/** Lifecycle of one address lookup in the UI. */
export type LookupStatus =
  | "idle"
  | "loading"
  | "not-found"
  | "no-pluto"
  | "error"
  | "done";

/** One row of the compare-mode stat table. */
export interface CompareStat {
  key: string;
  label: string;
  a: string;
  b: string;
  /** Which side is higher (or newer for year built); "tie" when equal. */
  higher: "a" | "b" | "tie" | null;
  /** True for year built, where "higher" means newer. */
  isYear?: boolean;
}
