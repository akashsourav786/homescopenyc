"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CircleDollarSign,
  Home,
  Info,
  Layers,
  Loader2,
  MapPin,
  Ruler,
  Scale,
  Search,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  lookupProperty,
  PropertyDataError,
} from "@/lib/property-data/client";
import {
  compareStats,
  formatCount,
  formatDate,
  formatMoney,
} from "@/lib/property-data/normalize";
import type {
  LookupStatus,
  PropertyInsight,
} from "@/lib/property-data/types";

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-card px-3.5 text-[15px] text-foreground " +
  "placeholder:text-muted/60 focus:outline-2 focus:outline-offset-1 focus:outline-ring";

export function AddressField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="street-address"
        className={inputClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-accent-soft/50 px-3.5 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading property data">
      <CardContent className="space-y-3 p-6">
        <div className="h-6 w-2/3 animate-pulse rounded-lg bg-accent-soft" />
        <div className="h-4 w-1/3 animate-pulse rounded-lg bg-accent-soft" />
        <div className="grid grid-cols-2 gap-2.5 pt-2 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-accent-soft"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusMessage({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pastel-peach text-pastel-peach-ink">
          <AlertCircle className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted">{body}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Result card                                                         */
/* ------------------------------------------------------------------ */

function InsightCard({ insight }: { insight: PropertyInsight }) {
  const p = insight.profile;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pastel-lavender text-pastel-lavender-ink">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-lg leading-snug">
              {p.displayAddress}
            </CardTitle>
            <CardDescription className="mt-1">
              {p.borough} · Block {p.block} · Lot {p.lot}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Fact label="Building class" value={p.buildingClass ?? "—"} />
          <Fact label="Land use" value={p.landUse ?? "—"} />
          <Fact
            label="Year built"
            value={p.yearBuilt === null ? "—" : String(p.yearBuilt)}
          />
          <Fact label="Stories" value={formatCount(p.stories)} />
          <Fact label="Residential units" value={formatCount(p.residentialUnits)} />
          <Fact label="Total units" value={formatCount(p.totalUnits)} />
          <Fact label="Lot sq ft" value={formatCount(p.lotSqft)} />
          <Fact label="Building sq ft" value={formatCount(p.buildingSqft)} />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign
              className="size-4 text-pastel-mint-ink"
              aria-hidden
            />
            <span className="text-sm text-muted">Assessed value</span>
            <span className="text-[15px] font-semibold text-foreground">
              {formatMoney(p.assessedValue)}
            </span>
          </div>
          {p.zoning.length > 0 && (
            <div className="flex items-center gap-2">
              <Tag className="size-4 text-pastel-blue-ink" aria-hidden />
              <span className="text-sm text-muted">Zoning</span>
              <span className="flex flex-wrap gap-1.5">
                {p.zoning.map((z) => (
                  <span
                    key={z}
                    className="rounded-lg bg-pastel-blue px-2 py-0.5 text-[13px] font-semibold text-pastel-blue-ink"
                  >
                    {z}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Last recorded sale
          </p>
          {insight.lastSale ? (
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {formatMoney(insight.lastSale.price)}
              </p>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Calendar className="size-4" aria-hidden />
                {formatDate(insight.lastSale.date)}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted">
              No recorded sales found for this tax lot in the Dept. of Finance
              dataset.
            </p>
          )}
        </div>

        {insight.sales.length > 1 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Sale history
            </p>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {insight.sales.map((s, i) => (
                <li
                  key={`${s.date}-${s.price}-${i}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="text-sm text-muted">
                    {formatDate(s.date)}
                  </span>
                  <span className="text-[15px] font-semibold text-foreground">
                    {formatMoney(s.price)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              $0 transfers (non-arm&apos;s-length) are excluded.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Lookup state                                                        */
/* ------------------------------------------------------------------ */

interface LookupState {
  status: LookupStatus;
  insight: PropertyInsight | null;
  message: string | null;
}

const IDLE_LOOKUP: LookupState = { status: "idle", insight: null, message: null };

function errorMessage(e: unknown): { status: LookupStatus; message: string } {
  if (e instanceof PropertyDataError) {
    switch (e.code) {
      case "not-found":
        return { status: "not-found", message: e.message };
      case "no-pluto":
        return { status: "no-pluto", message: e.message };
      default:
        return { status: "error", message: e.message };
    }
  }
  return {
    status: "error",
    message: "Something unexpected went wrong. Please try again.",
  };
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function PropertyInsights() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"single" | "compare">(
    searchParams.get("mode") === "compare" ? "compare" : "single",
  );
  const [addressA, setAddressA] = useState("");
  const [addressB, setAddressB] = useState("");
  const [lookupA, setLookupA] = useState<LookupState>(IDLE_LOOKUP);
  const [lookupB, setLookupB] = useState<LookupState>(IDLE_LOOKUP);

  const runLookup = async (
    address: string,
    setState: React.Dispatch<React.SetStateAction<LookupState>>,
  ) => {
    const trimmed = address.trim();
    if (!trimmed) {
      setState({
        status: "not-found",
        insight: null,
        message: "Enter an address to look up.",
      });
      return;
    }
    setState({ status: "loading", insight: null, message: null });
    try {
      const insight = await lookupProperty(trimmed);
      setState({ status: "done", insight, message: null });
    } catch (e) {
      const { status, message } = errorMessage(e);
      setState({ status, insight: null, message });
    }
  };

  const handleSingle = () => runLookup(addressA, setLookupA);
  const handleCompare = () => {
    runLookup(addressA, setLookupA);
    runLookup(addressB, setLookupB);
  };

  const showResults =
    lookupA.status !== "idle" || lookupB.status !== "idle";
  const bothDone =
    mode === "compare" &&
    lookupA.status === "done" &&
    lookupB.status === "done" &&
    lookupA.insight &&
    lookupB.insight;

  const accessedDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          Property Insights
        </h1>
        <p className="mt-2 flex items-start gap-1.5 text-[15px] text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Look up any NYC address for public-record details and recent
            sales — or compare two properties side by side.{" "}
            <strong className="font-semibold text-foreground">
              Data comes from NYC Open Data and may be outdated.
            </strong>
          </span>
        </p>
      </div>

      {/* Mode toggle */}
      <div
        role="tablist"
        aria-label="Lookup mode"
        className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1"
      >
        {(
          [
            { value: "single", label: "Single property", icon: Home },
            { value: "compare", label: "Compare two", icon: Scale },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
              mode === value
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-5 text-pastel-lavender-ink" aria-hidden />
            {mode === "single" ? "Find a property" : "Compare properties"}
          </CardTitle>
          <CardDescription>
            {mode === "single"
              ? "Enter a full NYC address, including the borough."
              : "Enter two NYC addresses to compare their public-record stats."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AddressField
            id="address-a"
            label={mode === "single" ? "Property address" : "Property A"}
            value={addressA}
            onChange={setAddressA}
            placeholder="350 5th Ave, Manhattan"
          />
          {mode === "compare" && (
            <AddressField
              id="address-b"
              label="Property B"
              value={addressB}
              onChange={setAddressB}
              placeholder="200 Eastern Pkwy, Brooklyn"
            />
          )}
          <Button
            size="lg"
            className="w-full"
            onClick={mode === "single" ? handleSingle : handleCompare}
            disabled={
              lookupA.status === "loading" || lookupB.status === "loading"
            }
          >
            {lookupA.status === "loading" || lookupB.status === "loading" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Looking up…
              </>
            ) : mode === "single" ? (
              <>
                <Search aria-hidden /> Look up property
              </>
            ) : (
              <>
                <Scale aria-hidden /> Compare
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {showResults && (
        <div className="space-y-6">
          {mode === "single" && (
            <LookupResult
              state={lookupA}
              onRetry={handleSingle}
              label="property"
            />
          )}

          {mode === "compare" && (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <LookupResult
                  state={lookupA}
                  onRetry={handleCompare}
                  label="Property A"
                />
                <LookupResult
                  state={lookupB}
                  onRetry={handleCompare}
                  label="Property B"
                />
              </div>
              {bothDone && (
                <CompareTable
                  a={lookupA.insight!}
                  b={lookupB.insight!}
                />
              )}
            </>
          )}

          {/* Contact CTA — directly under results. */}
          <Card className="border-accent/30 bg-accent-soft">
            <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">
                  Want a deeper read on this property?
                </p>
                <p className="text-sm text-muted">
                  Talk through what the public record means with a local expert.
                </p>
              </div>
              <Button asChild>
                <Link href="/contact">
                  Contact Akash <ArrowRight aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Always-visible disclaimer. */}
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
            <Info
              className="mt-0.5 size-4 shrink-0 text-muted"
              aria-hidden
            />
            <p className="text-[13px] leading-snug text-muted">
              <strong className="font-semibold text-foreground">
                Property data comes from NYC Open Data (PLUTO, Dept. of
                Finance sales records) and may be outdated or incomplete —
                verify with official records.
              </strong>{" "}
              Estimates only. Nothing here is an appraisal or a valuation.
            </p>
          </div>

          {/* Sources panel. */}
          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              Assumptions &amp; sources
            </summary>
            <ul className="list-disc space-y-2 border-t border-border p-4 pl-9 text-sm text-muted">
              <li>
                Address search: NYC Planning Labs Geosearch v2 (free, no key).
                Accessed {accessedDate}.
              </li>
              <li>
                Property profile: NYC Open Data, Primary Land Use Tax Lot
                Output (PLUTO), dataset 64uk-42ks. Accessed {accessedDate}.
              </li>
              <li>
                Sale history: NYC Open Data, NYC Citywide Annualized Calendar
                Sales Update (Dept. of Finance), dataset w2pb-icbu — up to 5
                most recent sales; $0 transfers excluded. Accessed{" "}
                {accessedDate}.
              </li>
              <li>
                When the backend is deployed, these lookups will move
                server-side (proxy + cache); the browser currently calls the
                public APIs directly.
              </li>
              <li>
                Zoning, assessed values, and building facts reflect the latest
                published PLUTO release, which can lag real-world changes.
              </li>
            </ul>
          </details>
        </div>
      )}

      {/* Empty state */}
      {!showResults && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-pastel-lavender text-pastel-lavender-ink">
              <MapPin className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-semibold text-foreground">
              Enter an address above to see its public record
            </p>
            <p className="max-w-sm text-sm text-muted">
              Building facts, assessed value, zoning, and recent sales — pulled
              live from official NYC datasets.
            </p>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

/* ------------------------------------------------------------------ */
/* Lookup result + compare table                                       */
/* ------------------------------------------------------------------ */

function LookupResult({
  state,
  onRetry,
  label,
}: {
  state: LookupState;
  onRetry: () => void;
  label: string;
}) {
  if (state.status === "idle") return null;
  if (state.status === "loading") return <LoadingSkeleton />;
  if (state.status === "done" && state.insight) {
    return <InsightCard insight={state.insight} />;
  }
  const titles: Record<string, string> = {
    "not-found": `We couldn't find that ${label.toLowerCase()}`,
    "no-pluto": "Address found, no property record",
    error: "Something went wrong",
  };
  return (
    <StatusMessage
      title={titles[state.status] ?? "Something went wrong"}
      body={state.message ?? "Please try again."}
      onRetry={onRetry}
    />
  );
}

function CompareTable({ a, b }: { a: PropertyInsight; b: PropertyInsight }) {
  const rows = compareStats(
    a.profile,
    b.profile,
    a.lastSale,
    b.lastSale,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-5 text-pastel-blue-ink" aria-hidden />
          Side-by-side comparison
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">A:</span>{" "}
          {a.profile.displayAddress} ·{" "}
          <span className="font-medium text-foreground">B:</span>{" "}
          {b.profile.displayAddress}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-2 py-2 font-semibold">Stat</th>
              <th className="px-2 py-2 text-right font-semibold">A</th>
              <th className="px-2 py-2 text-right font-semibold">B</th>
              <th className="w-16 px-2 py-2 text-right font-semibold">
                <span className="sr-only">Comparison</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-2 py-2.5 text-muted">{r.label}</td>
                <td className="px-2 py-2.5 text-right font-semibold text-foreground">
                  {r.a}
                </td>
                <td className="px-2 py-2.5 text-right font-semibold text-foreground">
                  {r.b}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <CompareBadge row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex items-start gap-1.5 px-2 py-3 text-xs text-muted">
          <Ruler className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Indicators show which property is higher
          {rows.some((r) => r.isYear) ? " (or newer, for year built)" : ""} —
          not which is better.
        </p>
      </CardContent>
    </Card>
  );
}

function CompareBadge({ row }: { row: { higher: string | null; isYear?: boolean } }) {
  if (row.higher === "tie") {
    return (
      <span className="inline-block rounded-lg bg-accent-soft px-2 py-0.5 text-xs font-semibold text-muted">
        Tie
      </span>
    );
  }
  if (row.higher === null) {
    return <span className="text-xs text-muted">—</span>;
  }
  const label = row.isYear
    ? row.higher === "a"
      ? "A newer"
      : "B newer"
    : row.higher === "a"
      ? "A higher"
      : "B higher";
  return (
    <span className="inline-block rounded-lg bg-pastel-mint px-2 py-0.5 text-xs font-semibold text-pastel-mint-ink">
      {label}
    </span>
  );
}
