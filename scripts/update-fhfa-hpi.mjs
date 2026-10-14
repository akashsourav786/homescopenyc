#!/usr/bin/env node
/**
 * Refresh lib/property-data/fhfa-hpi.json from FHFA's HPI master CSV.
 *
 * Extracts the quarterly purchase-only, not-seasonally-adjusted index for
 * the New York-Jersey City-White Plains, NY-NJ MSAD (place_id 35614) —
 * the metro series used to time-adjust comparable sales in the
 * home-worth estimator.
 *
 * Usage: node scripts/update-fhfa-hpi.mjs
 * No API key needed. Re-run whenever FHFA publishes a new quarter
 * (master CSV "vintage" moves forward) and commit the result.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CSV_URL = "https://www.fhfa.gov/hpi/download/monthly/hpi_master.csv";
const PLACE_ID = "35614"; // New York-Jersey City-White Plains, NY-NJ (MSAD)
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "property-data",
  "fhfa-hpi.json",
);

/** Minimal CSV parser that honors quoted fields. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const res = await fetch(CSV_URL, { headers: { Accept: "text/csv" } });
if (!res.ok) throw new Error(`FHFA download failed: HTTP ${res.status}`);
const rows = parseCsv(await res.text());
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const series = {};
for (const r of rows.slice(1)) {
  if (
    r[idx.hpi_flavor] !== "purchase-only" ||
    r[idx.frequency] !== "quarterly" ||
    r[idx.level] !== "MSA" ||
    r[idx.place_id] !== PLACE_ID
  )
    continue;
  const v = Number(r[idx.index_nsa]);
  if (!Number.isFinite(v) || v <= 0) continue;
  series[`${r[idx.yr]}-Q${r[idx.period]}`] = Math.round(v * 100) / 100;
}

const quarters = Object.keys(series).sort();
if (quarters.length === 0) throw new Error("no matching series rows found");
const placeName = rows.find(
  (r) => r[idx.place_id] === PLACE_ID && r[idx.level] === "MSA",
)?.[idx.place_name];

const out = {
  vintage: quarters[quarters.length - 1],
  place: placeName ?? "New York-Jersey City-White Plains, NY-NJ (MSAD)",
  source:
    "FHFA House Price Index, purchase-only, not seasonally adjusted, quarterly",
  series,
};
await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(
  `wrote ${OUT}: ${quarters.length} quarters, ${quarters[0]} → ${out.vintage}`,
);
