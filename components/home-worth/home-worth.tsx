"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Home,
  Info,
  LineChart,
  Loader2,
  MapPin,
  Search,
} from "lucide-react";
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
  AddressField,
  LoadingSkeleton,
  StatusMessage,
} from "@/components/property-insights/property-insights";
import { PropertyDataError } from "@/lib/property-data/client";
import {
  COMP_LOOKBACK_DAYS,
  MIN_COMPS,
  estimateHomeValue,
  formatRangeK,
} from "@/lib/property-data/home-worth";
import {
  formatCount,
  formatDate,
  formatMoney,
} from "@/lib/property-data/normalize";
import type { HomeWorthOutcome } from "@/lib/property-data/home-worth";
import type {
  LookupStatus,
  PropertyProfile,
} from "@/lib/property-data/types";

type EstimateStatus = LookupStatus | "no-data";

interface EstimateState {
  status: EstimateStatus;
  outcome: HomeWorthOutcome | null;
  message: string | null;
}

const IDLE: EstimateState = { status: "idle", outcome: null, message: null };

function errorState(e: unknown): EstimateState {
  if (e instanceof PropertyDataError) {
    if (e.code === "not-found")
      return { status: "not-found", outcome: null, message: e.message };
    if (e.code === "no-pluto")
      return { status: "no-pluto", outcome: null, message: e.message };
    return { status: "error", outcome: null, message: e.message };
  }
  return {
    status: "error",
    outcome: null,
    message: "Something unexpected went wrong. Please try again.",
  };
}

export function HomeWorth() {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<EstimateState>(IDLE);
  // "Accessed <date>" stamps when the visitor actually loads the page —
  // computed after mount so static prerendering stays deterministic.
  const [accessedDate, setAccessedDate] = useState("");
  useEffect(() => {
    // Intentional mount-only stamp: the access date must be computed after
    // mount so static prerendering stays deterministic (Next 16 flags
    // `new Date()` during prerender).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccessedDate(
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    );
  }, []);

  const runEstimate = async () => {
    const trimmed = address.trim();
    if (!trimmed) {
      setState({
        status: "not-found",
        outcome: null,
        message: "Enter your home's address to get an estimate.",
      });
      return;
    }
    setState({ status: "loading", outcome: null, message: null });
    try {
      const outcome = await estimateHomeValue(trimmed);
      if (outcome.ok) {
        setState({ status: "done", outcome, message: null });
      } else {
        setState({ status: "no-data", outcome, message: null });
      }
    } catch (e) {
      setState(errorState(e));
    }
  };

  const showResults = state.status === "done" || state.status === "no-data";

  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          What&apos;s My Home Worth?
        </h1>
        <p className="mt-2 flex items-start gap-1.5 text-[15px] text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            A rough value range from recent nearby closed sales — built on
            public NYC records.{" "}
            <strong className="font-semibold text-foreground">
              This is an estimate, not an appraisal.
            </strong>
          </span>
        </p>
      </div>

      {/* Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-5 text-pastel-peach-ink" aria-hidden />
            Estimate your home&apos;s value
          </CardTitle>
          <CardDescription>
            Enter your NYC home address, including the borough.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AddressField
            id="home-address"
            label="Home address"
            value={address}
            onChange={setAddress}
            placeholder="35 Fordham Hill Oval, Bronx"
          />
          <Button
            size="lg"
            className="w-full"
            onClick={runEstimate}
            disabled={state.status === "loading"}
          >
            {state.status === "loading" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Estimating…
              </>
            ) : (
              <>
                <LineChart aria-hidden /> Estimate my home&apos;s value
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {showResults && state.outcome && (
        <div className="space-y-6">
          {state.outcome.ok ? (
            <EstimateHero outcome={state.outcome} />
          ) : (
            <NoDataCard outcome={state.outcome} onRetry={runEstimate} />
          )}

          {/* Contact CTA — directly under results. */}
          <Card className="border-accent/30 bg-accent-soft">
            <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">
                  Want a professional CMA?
                </p>
                <p className="text-sm text-muted">
                  A computer can&apos;t walk through your kitchen — Akash can.
                  Get a real comparative market analysis.
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
            <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <p className="text-[13px] leading-snug text-muted">
              <strong className="font-semibold text-foreground">
                Rough comp-based estimate from NYC public sales records — not
                an appraisal.
              </strong>{" "}
              Verify with a licensed professional before making decisions.
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
                Property facts: NYC Open Data, Primary Land Use Tax Lot Output
                (PLUTO), dataset 64uk-42ks. Accessed {accessedDate}.
              </li>
              <li>
                Comparable sales: NYC Open Data, NYC Citywide Annualized
                Calendar Sales Update (Dept. of Finance), dataset w2pb-icbu —
                same ZIP code, same building-class letter, sold within the
                last {COMP_LOOKBACK_DAYS} days, price ≥ $1,000. $0 and
                nominal transfers (non-arm&apos;s-length) excluded. Accessed{" "}
                {accessedDate}.
              </li>
              <li>
                Method: median $/sqft across valid comps × the subject
                building&apos;s PLUTO sqft = midpoint; range = midpoint ±10%.
                Requires at least {MIN_COMPS} valid comps and a known building
                sqft — otherwise no estimate is shown.
              </li>
              <li>
                Condo and co-op unit sales carry no square footage in the
                public data, so those homes usually can&apos;t be estimated
                this way — a manual CMA is the honest route.
              </li>
            </ul>
          </details>
        </div>
      )}

      {/* Loading / error states */}
      {state.status === "loading" && <LoadingSkeleton />}
      {(state.status === "not-found" ||
        state.status === "no-pluto" ||
        state.status === "error") && (
        <StatusMessage
          title={
            state.status === "not-found"
              ? "We couldn't find that address"
              : state.status === "no-pluto"
                ? "Address found, no property record"
                : "Something went wrong"
          }
          body={state.message ?? "Please try again."}
          onRetry={runEstimate}
        />
      )}

      {/* Empty state */}
      {state.status === "idle" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-pastel-peach text-pastel-peach-ink">
              <Home className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-semibold text-foreground">
              Enter your address above for a value range
            </p>
            <p className="max-w-sm text-sm text-muted">
              We&apos;ll compare recent nearby closed sales and show you a
              transparent estimate range — never a fake-precise number.
            </p>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

/* ------------------------------------------------------------------ */
/* Estimate hero + comps                                               */
/* ------------------------------------------------------------------ */

function EstimateHero({
  outcome,
}: {
  outcome: Extract<HomeWorthOutcome, { ok: true }>;
}) {
  const e = outcome.estimate;
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-accent-soft px-6 pb-5 pt-6">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <MapPin className="size-3.5" aria-hidden />
            Estimated value range
          </p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {formatRangeK(e.low)} – {formatRangeK(e.high)}
          </p>
          <p className="mt-2 text-[15px] text-muted">
            Midpoint{" "}
            <strong className="font-semibold text-foreground">
              {formatMoney(e.midpoint)}
            </strong>{" "}
            · median{" "}
            <strong className="font-semibold text-foreground">
              ${e.medianPricePerSqft.toLocaleString("en-US")}/sq ft
            </strong>{" "}
            across {e.compCount} comparable sale{e.compCount === 1 ? "" : "s"}
          </p>
        </div>
        <CardContent className="p-6 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Comparable sales used
          </p>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {e.comps.map((c, i) => (
              <li
                key={`${c.date}-${c.price}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {c.address}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Calendar className="size-3" aria-hidden />
                    {formatDate(c.date)} ·{" "}
                    {c.sqft.toLocaleString("en-US")} sq ft
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-semibold text-foreground">
                    {formatMoney(c.price)}
                  </p>
                  <p className="text-xs text-muted">
                    ${Math.round(c.pricePerSqft).toLocaleString("en-US")}/sq ft
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl bg-accent-soft/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              How we estimated this
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              We found {e.compCount} recent {e.criteriaNote}. For each, we
              divided its sale price by its square footage, took the{" "}
              <strong className="font-semibold text-foreground">
                median $/sq ft
              </strong>
              , and multiplied it by your home&apos;s{" "}
              {(e.subject.buildingSqft ?? 0).toLocaleString("en-US")} sq ft
              (per PLUTO). The range is that midpoint ±10% — renovations,
              condition, and lot premiums aren&apos;t in public records, so
              treat this as a starting point, not a price tag.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Subject property facts (compact strip — the estimate's inputs). */}
      <SubjectStrip profile={e.subject} />
    </div>
  );
}

function SubjectStrip({ profile: p }: { profile: PropertyProfile }) {
  const facts: [string, string][] = [
    ["Building class", p.buildingClass ?? "—"],
    ["Year built", p.yearBuilt === null ? "—" : String(p.yearBuilt)],
    ["Total units", formatCount(p.totalUnits)],
    ["Building sq ft", formatCount(p.buildingSqft)],
    ["Lot sq ft", formatCount(p.lotSqft)],
    ["Zoning", p.zoning.length > 0 ? p.zoning.join(", ") : "—"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your home (per PLUTO)</CardTitle>
        <CardDescription>
          {p.displayAddress} · {p.borough} · Block {p.block} · Lot {p.lot} —
          the public-record facts behind this estimate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl bg-accent-soft/50 px-3.5 py-2.5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {label}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-foreground">
                {value}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function NoDataCard({
  outcome,
  onRetry,
}: {
  outcome: Extract<HomeWorthOutcome, { ok: false }>;
  onRetry: () => void;
}) {
  const isSqft = outcome.reason === "no-subject-sqft";
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pastel-peach text-pastel-peach-ink">
          <Home className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-foreground">
            {isSqft
              ? "We can't estimate this property from public data"
              : "Not enough comparable sales"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {isSqft ? (
              <>
                This lot has no recorded building square footage in PLUTO
                (often vacant land or a data gap), so there&apos;s nothing to
                multiply a $/sq ft figure by. A human has to price this one.
              </>
            ) : (
              <>
                We found {outcome.compsFound} usable comparable sale
                {outcome.compsFound === 1 ? "" : "s"} — we need at least{" "}
                {MIN_COMPS} to build an honest range.{" "}
                {outcome.subject &&
                ["R", "D"].includes(
                  (outcome.subject.buildingClass ?? "").charAt(0).toUpperCase(),
                )
                  ? "Condo and co-op unit sales don't include square footage in the public data, which is usually why."
                  : "Thin sales history in this area is usually why."}{" "}
                This is exactly what a manual CMA is for.
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try another address
        </Button>
      </CardContent>
    </Card>
  );
}
