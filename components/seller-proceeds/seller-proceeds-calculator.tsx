"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  Calculator,
  ChevronDown,
  HandCoins,
  Info,
} from "lucide-react";
import { Container } from "@/components/container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ATTORNEY_FEE,
  DEFAULT_COMMISSION_PCT,
  estimateProceeds,
  type SellerProceedsInputs,
  type SellerProceedsResult,
  type ValidationIssue,
} from "@/lib/calculators/seller-proceeds";
import { NumberField } from "./fields";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Parse a raw text field into a number; NaN when empty/unparseable. */
function parseNum(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return NaN;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
/** Optional money fields: blank means 0. */
function parseOrZero(raw: string): number {
  const n = parseNum(raw);
  return Number.isNaN(n) ? 0 : n;
}

function Waterfall({ result }: { result: SellerProceedsResult }) {
  const rows = result.deductions;
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between bg-background px-4 py-2.5 text-sm">
        <span className="font-semibold text-foreground">Sale price</span>
        <span className="font-semibold text-foreground">
          {usd0.format(result.salePrice)}
        </span>
      </div>
      {rows.map((d) => (
        <div
          key={d.label}
          className="border-t border-border px-4 py-2.5 text-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">{d.label}</span>
            <span className="shrink-0 font-semibold text-foreground">
              −{usd0.format(d.amount)}
            </span>
          </div>
          {d.note && (
            <p className="mt-0.5 pr-8 text-xs text-muted/80">{d.note}</p>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between border-t-2 border-border bg-background px-4 py-2.5 text-sm">
        <span className="font-semibold text-foreground">Total deductions</span>
        <span className="font-semibold text-foreground">
          −{usd0.format(result.totalDeductions)}
        </span>
      </div>
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          result.netProceeds < 0 ? "bg-pastel-peach/50" : "bg-accent-soft",
        )}
      >
        <span className="text-sm font-bold text-foreground">
          Estimated net proceeds
        </span>
        <span className="text-lg font-bold text-foreground">
          {result.netProceeds < 0 ? "−" : ""}
          {usd0.format(Math.abs(result.netProceeds))}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calculator                                                          */
/* ------------------------------------------------------------------ */

export function SellerProceedsCalculator() {
  // ---- form state (raw strings for text inputs) ----
  const [salePrice, setSalePrice] = useState("1000000");
  const [firstMortgage, setFirstMortgage] = useState("400000");
  const [secondMortgage, setSecondMortgage] = useState("");
  const [commissionPct, setCommissionPct] = useState(
    String(DEFAULT_COMMISSION_PCT),
  );
  const [sellerConcessions, setSellerConcessions] = useState("");
  const [attorneyFee, setAttorneyFee] = useState(String(DEFAULT_ATTORNEY_FEE));
  const [otherCosts, setOtherCosts] = useState("");

  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  // ---- draft → applied: the form edits drafts; results only recalculate
  // when the user taps Calculate. ----
  const draftFields = [
    salePrice,
    firstMortgage,
    secondMortgage,
    commissionPct,
    sellerConcessions,
    attorneyFee,
    otherCosts,
  ];

  function buildInputs(): SellerProceedsInputs {
    return {
      salePrice: parseNum(salePrice),
      firstMortgageBalance: parseOrZero(firstMortgage),
      secondMortgageBalance: parseOrZero(secondMortgage),
      commissionPct: parseNum(commissionPct),
      sellerConcessions: parseOrZero(sellerConcessions),
      attorneyFee: parseOrZero(attorneyFee),
      otherSellerCosts: parseOrZero(otherCosts),
    };
  }

  const [appliedInputs, setAppliedInputs] = useState<SellerProceedsInputs>(
    () => buildInputs(),
  );
  const [appliedSnapshot, setAppliedSnapshot] = useState(() =>
    draftFields.join("|"),
  );
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [calculatedAt, setCalculatedAt] = useState<Date | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const inputsDirty = draftFields.join("|") !== appliedSnapshot;

  function handleCalculate() {
    const inputs = buildInputs();
    const check = estimateProceeds(inputs);
    if (!check.ok) {
      setIssues(check.issues);
      return;
    }
    setIssues([]);
    setAppliedInputs(inputs);
    setAppliedSnapshot(draftFields.join("|"));
    setCalculatedAt(new Date());
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const outcome = useMemo(() => estimateProceeds(appliedInputs), [appliedInputs]);
  const result: SellerProceedsResult | null = outcome.ok ? outcome.value : null;
  const negative = result !== null && result.netProceeds < 0;

  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          What Will You Keep?
        </h1>
        <p className="mt-2 flex items-start gap-1.5 text-[15px] text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Estimate your net proceeds from an NYC sale — the sale price minus
            everything you pay at closing.{" "}
            <strong className="font-semibold text-foreground">
              Estimates only — not professional advice.
            </strong>
          </span>
        </p>
      </div>

      {/* Validation issues (from the last Calculate tap) */}
      {issues.length > 0 && (
        <Card className="mb-6 border-pastel-peach-ink/40 bg-pastel-peach/40">
          <CardContent className="flex gap-3 p-5">
            <AlertCircle
              className="size-5 shrink-0 text-pastel-peach-ink"
              aria-hidden
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Check these inputs, then tap Calculate again
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
                {issues.map((i) => (
                  <li key={i.code}>{i.message}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results hero + full deduction waterfall */}
      {outcome.ok && result && (
        <div ref={resultsRef} className="scroll-mt-4">
          <Card className="mb-6 overflow-hidden">
            <div
              className={cn(
                "px-6 pb-6 pt-6",
                negative ? "bg-pastel-peach/50" : "bg-accent-soft",
              )}
            >
              <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                {negative
                  ? "Estimated shortfall — cash needed at closing"
                  : "Estimated net proceeds"}
              </p>
              <p
                className={cn(
                  "mt-1 text-[32px] font-bold leading-none tracking-tight sm:text-4xl",
                  negative ? "text-pastel-peach-ink" : "text-foreground",
                )}
              >
                {negative ? "−" : ""}
                {usd0.format(Math.abs(result.netProceeds))}
              </p>
              {negative ? (
                <p className="mt-2 text-sm font-semibold text-foreground">
                  In this scenario the sale wouldn&apos;t cover everything you
                  owe — you&apos;d need to bring{" "}
                  {usd0.format(Math.abs(result.netProceeds))} to closing. Talk
                  to a real-estate attorney before listing.
                </p>
              ) : (
                <p className="mt-2 text-[13px] text-muted">
                  What you&apos;d walk away with after mortgage payoffs,
                  commission, transfer taxes, and closing costs.
                </p>
              )}
              {inputsDirty ? (
                <p className="mt-2 text-[13px] font-semibold text-pastel-peach-ink">
                  Your inputs changed — tap Calculate below to update these
                  results.
                </p>
              ) : calculatedAt ? (
                <p className="mt-2 text-[13px] text-muted">
                  Last calculated{" "}
                  {calculatedAt.toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  with your current inputs.
                </p>
              ) : null}
              <p className="mt-2 text-[13px] text-muted">
                Your information stays on this device — nothing is sent
                anywhere.
              </p>
            </div>
            <CardContent className="p-6 pt-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-background p-3.5">
                  <p className="text-xs text-muted">Sale price</p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {usd0.format(result.salePrice)}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3.5">
                  <p className="text-xs text-muted">Total deductions</p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {usd0.format(result.totalDeductions)}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3.5">
                  <p className="text-xs text-muted">Equity before costs</p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {usd0.format(result.equityBeforeCosts)}
                  </p>
                </div>
              </div>

              <Waterfall result={result} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Contact CTA — directly under results. */}
      {outcome.ok && (
        <Card className="mb-6 border-accent/30 bg-accent-soft">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">
                Want a better understanding of these numbers?
              </p>
              <p className="text-sm text-muted">
                Walk through your sale scenario with a local expert.
              </p>
            </div>
            <Button asChild>
              <Link href="/contact">
                Contact Akash <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Always-visible disclaimers (not buried in the assumptions panel). */}
      {outcome.ok && (
        <div className="mb-6 space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
            <Info
              className="mt-0.5 size-4 shrink-0 text-muted"
              aria-hidden
            />
            <p className="text-[13px] leading-snug text-muted">
              <strong className="font-semibold text-foreground">
                Estimates only — not professional advice.
              </strong>{" "}
              Consult a real-estate attorney and/or CPA before listing or
              selling.
            </p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
            <Info
              className="mt-0.5 size-4 shrink-0 text-muted"
              aria-hidden
            />
            <p className="text-[13px] leading-snug text-muted">
              <strong className="font-semibold text-foreground">
                Capital-gains tax is not included.
              </strong>{" "}
              It depends on your holding period, cost basis, and whether the
              primary-residence exclusion applies — a CPA can estimate it.
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HandCoins className="size-5 text-pastel-mint-ink" aria-hidden />
              Sale &amp; loans
            </CardTitle>
            <CardDescription>
              The price you expect, and what you still owe on the property.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <NumberField
                id="sale-price"
                label="Expected sale price"
                value={salePrice}
                onChange={setSalePrice}
                prefix="$"
                placeholder="1,000,000"
                hint="The contract price you and the buyer agree on."
              />
            </div>
            <NumberField
              id="first-mortgage"
              label="First mortgage balance"
              value={firstMortgage}
              onChange={setFirstMortgage}
              prefix="$"
              placeholder="400,000"
              hint="Your lender's official payoff figure may include accrued interest and fees — check your payoff statement. Enter 0 if you own the home free and clear."
            />
            <NumberField
              id="second-mortgage"
              label="Second mortgage / HELOC balance"
              value={secondMortgage}
              onChange={setSecondMortgage}
              prefix="$"
              placeholder="0"
              hint="Leave blank if you have no second mortgage or HELOC."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeDollarSign
                className="size-5 text-pastel-peach-ink"
                aria-hidden
              />
              Selling costs
            </CardTitle>
            <CardDescription>
              What you pay to close the deal, beyond the mortgage.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="commission"
              label="Broker commission rate"
              value={commissionPct}
              onChange={setCommissionPct}
              suffix="%"
              placeholder="6"
              hint="Illustrative default 6%. Broker commission is negotiable — you and your agent decide this together."
            />
            <NumberField
              id="concessions"
              label="Seller concessions"
              value={sellerConcessions}
              onChange={setSellerConcessions}
              prefix="$"
              placeholder="0"
              hint="Credits to the buyer in your contract — for example, repair credits or closing-cost help."
            />
            <NumberField
              id="attorney"
              label="Attorney fee"
              value={attorneyFee}
              onChange={setAttorneyFee}
              prefix="$"
              placeholder="2,500"
              hint="NYC seller attorney fees often run a few thousand dollars — confirm with your attorney."
            />
            <NumberField
              id="other-costs"
              label="Other seller costs"
              value={otherCosts}
              onChange={setOtherCosts}
              prefix="$"
              placeholder="0"
              hint="For example, a co-op flip tax or building move-out / transfer fees."
            />
          </CardContent>
        </Card>
      </div>

      {/* Calculate — applies the current form values */}
      <div className="mt-6">
        <Button
          type="button"
          size="lg"
          onClick={handleCalculate}
          className="w-full sm:w-auto sm:min-w-64"
        >
          <Calculator aria-hidden />
          Calculate my net proceeds
        </Button>
        <p className="mt-2 text-[13px] text-muted">
          Runs the numbers with everything you entered above.
        </p>
      </div>

      {/* Assumptions */}
      {outcome.ok && result && (
        <Card className="mt-6">
          <button
            type="button"
            onClick={() => setAssumptionsOpen((v) => !v)}
            aria-expanded={assumptionsOpen}
            className="flex w-full items-center justify-between p-6 text-left"
          >
            <span className="text-base font-semibold text-foreground">
              Assumptions &amp; limitations
            </span>
            <ChevronDown
              className={cn(
                "size-5 text-muted transition-transform",
                assumptionsOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {assumptionsOpen && (
            <CardContent className="pt-0">
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
                {result.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <div className="mt-4 rounded-xl bg-pastel-peach/40 p-4 text-[13px] text-muted">
                <strong className="font-semibold text-foreground">
                  Estimates only.
                </strong>{" "}
                This calculator does not constitute legal, tax, or financial
                advice. Consult a real-estate attorney and/or CPA before
                listing or selling.
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </Container>
  );
}
