"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  ChevronDown,
  Home,
  Info,
  MapPin,
  Wallet,
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
  calculateMonthlyCost,
  type LoanProgramId,
  type MonthlyCostInputs,
  type MonthlyCostResult,
  type ValidationIssue,
} from "@/lib/calculators/monthly-cost";
import {
  CREDIT_TIERS,
  LOAN_PROGRAMS,
  LOAN_PROGRAM_LIST,
  getMinDownPct,
} from "@/lib/calculators/loan-programs";
// Field primitives are generic (no buying-power-specific logic) — shared.
import {
  NumberField,
  SelectField,
  SegmentedControl,
} from "@/components/buying-power/fields";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

function ResultRows({ rows }: { rows: [string, number, string?][] }) {
  return (
    <div className="mt-5 rounded-xl border border-border">
      {rows.map(([label, value, suffix], i) => (
        <div
          key={label}
          className={cn(
            "flex items-center justify-between px-4 py-2.5 text-sm",
            i < rows.length - 1 && "border-b border-border",
          )}
        >
          <span className="text-muted">{label}</span>
          <span className="font-semibold text-foreground">
            {usd2.format(value)}
            <span className="font-normal text-muted">{suffix ?? "/mo"}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calculator                                                          */
/* ------------------------------------------------------------------ */

export function MonthlyCostCalculator() {
  // ---- form state (raw strings for text inputs) ----
  const [purchasePrice, setPurchasePrice] = useState("650000");
  const [downMode, setDownMode] = useState<"percent" | "amount">("percent");
  const [downPct, setDownPct] = useState("20");
  const [downAmount, setDownAmount] = useState("130000");
  const [loanProgramId, setLoanProgramId] =
    useState<LoanProgramId>("conventional");
  const [creditTierId, setCreditTierId] = useState<string>("none");
  const [annualRatePct, setAnnualRatePct] = useState("6.5");
  const [loanTermYears, setLoanTermYears] = useState("30");
  const [annualPropertyTax, setAnnualPropertyTax] = useState("6000");
  const [annualInsurance, setAnnualInsurance] = useState("1800");
  const [monthlyHOA, setMonthlyHOA] = useState("0");

  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const programForForm = LOAN_PROGRAMS[loanProgramId];
  const minDownPct = getMinDownPct(programForForm, "single");

  // ---- draft → applied: the form edits drafts; results only recalculate
  // when the user taps Calculate. ----
  const draftFields = [
    purchasePrice,
    downMode,
    downPct,
    downAmount,
    loanProgramId,
    creditTierId,
    annualRatePct,
    loanTermYears,
    annualPropertyTax,
    annualInsurance,
    monthlyHOA,
  ];

  function buildInputs(): MonthlyCostInputs {
    return {
      purchasePrice: parseNum(purchasePrice),
      downPayment:
        downMode === "percent"
          ? { mode: "percent", pct: parseNum(downPct) }
          : { mode: "amount", amount: parseOrZero(downAmount) },
      annualRatePct: parseNum(annualRatePct),
      loanTermYears: parseInt(loanTermYears, 10),
      annualPropertyTax: parseOrZero(annualPropertyTax),
      annualInsurance: parseOrZero(annualInsurance),
      monthlyHOA: parseOrZero(monthlyHOA),
      loanProgramId,
      creditTierId: creditTierId === "none" ? undefined : creditTierId,
    };
  }

  const [appliedInputs, setAppliedInputs] = useState<MonthlyCostInputs>(
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
    const check = calculateMonthlyCost(inputs);
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

  const outcome = useMemo(() => calculateMonthlyCost(appliedInputs), [appliedInputs]);
  const result: MonthlyCostResult | null = outcome.ok ? outcome.value : null;

  /** Rows for the monthly-breakdown and cash-to-close tables. */
  function buildRows(): {
    monthlyRows: [string, number, string?][];
    closingRows: [string, number, string?][];
  } {
    const monthlyRows: [string, number, string?][] = [];
    const closingRows: [string, number, string?][] = [];
    if (!result) return { monthlyRows, closingRows };
    monthlyRows.push(
      ["Principal & interest", result.monthly.principalAndInterest],
      ["Property tax", result.monthly.propertyTax],
      ["Homeowners insurance", result.monthly.insurance],
    );
    if (result.monthly.mortgageInsurance > 0) {
      monthlyRows.push(["Mortgage insurance", result.monthly.mortgageInsurance]);
    }
    monthlyRows.push(["HOA / maintenance", result.monthly.hoa]);
    closingRows.push(["Down payment", result.downPaymentAmount, ""]);
    for (const l of result.closingCosts) {
      closingRows.push([l.label, l.amount, ""]);
    }
    return { monthlyRows, closingRows };
  }

  const { monthlyRows, closingRows } = buildRows();

  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          True Monthly Cost
        </h1>
        <p className="mt-2 flex items-start gap-1.5 text-[15px] text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Your real monthly payment — plus what you&apos;d need at closing —
            for an NYC home.{" "}
            <strong className="font-semibold text-foreground">
              These are estimates, not a loan approval.
            </strong>
          </span>
        </p>
        <div className="mt-3 rounded-xl border border-pastel-mint-ink/30 bg-pastel-mint/50 p-3.5">
          <p className="text-sm leading-snug">
            <strong className="font-bold text-foreground">
              NYC buyers pay extra at closing.
            </strong>{" "}
            <span className="text-muted">
              This estimate includes the mortgage recording tax and, at $1M
              and up, the mansion tax — both paid by the buyer.
            </span>
          </p>
        </div>
      </div>

      {/* Validation issues (from the last Calculate tap) */}
      {issues.length > 0 && (
        <Card className="mb-6 border-pastel-peach-ink/40 bg-pastel-peach/40">
          <CardContent className="flex gap-3 p-5">
            <AlertCircle className="size-5 shrink-0 text-pastel-peach-ink" aria-hidden />
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

      {/* Results hero */}
      {result && (
        <div ref={resultsRef} className="scroll-mt-4">
          <Card className="mb-6 overflow-hidden">
            <div className="bg-accent-soft px-6 pb-6 pt-6">
              <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                Estimated true monthly cost
              </p>
              <p className="mt-1 text-[32px] font-bold leading-none tracking-tight text-foreground sm:text-4xl">
                {usd0.format(result.monthly.total)}
                <span className="text-muted">/mo</span>
              </p>
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
                {usd0.format(result.purchasePrice)} purchase ·{" "}
                {(result.downPct * 100).toFixed(1)}% down (
                {usd0.format(result.downPaymentAmount)}) · {result.effectiveRatePct.toFixed(2)}%
                rate. Your information stays on this device — nothing is sent
                anywhere.
              </p>
            </div>
            <CardContent className="p-6 pt-5">
              <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                Monthly breakdown
              </p>
              <ResultRows rows={monthlyRows} />

              <div className="mt-6">
                <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                  Cash to close — {usd0.format(result.cashToClose)}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  What you&apos;d need on hand the day of closing: the down
                  payment plus NYC closing costs.
                </p>
                <ResultRows rows={closingRows} />
              </div>

              <p className="mt-4 flex items-start gap-1.5 text-[13px] text-muted">
                <Wallet className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold text-foreground">
                    What drives this number?{" "}
                  </strong>
                  About{" "}
                  {result.monthly.total > 0
                    ? Math.round(
                        (result.monthly.principalAndInterest / result.monthly.total) * 100,
                      )
                    : 0}
                  % of the monthly cost is principal &amp; interest — a bigger
                  down payment or a lower rate shrinks that slice first.
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Contact CTA — directly under results. */}
      {result && (
        <Card className="mb-6 border-accent/30 bg-accent-soft">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">
                Want a better understanding of these numbers?
              </p>
              <p className="text-sm text-muted">
                Walk through your scenario with a local expert.
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

      {/* Visible disclaimer — reads without opening the assumptions panel.
          A second copy lives inside the panel (belt and suspenders). */}
      {result && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-[13px] leading-snug text-muted">
            <strong className="font-semibold text-foreground">
              Estimates only — not a loan approval or preapproval.
            </strong>{" "}
            Real costs depend on the final loan terms, appraisal, and
            negotiations. Consult a licensed mortgage professional before
            making decisions.
          </p>
        </div>
      )}

      {/* Form */}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="size-5 text-pastel-mint-ink" aria-hidden />
              Home & down payment
            </CardTitle>
            <CardDescription>
              The price and how much you&apos;ll put down up front.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <NumberField
                id="price"
                label="Purchase price"
                value={purchasePrice}
                onChange={setPurchasePrice}
                prefix="$"
                placeholder="650,000"
              />
            </div>
            <div className="sm:col-span-2">
              <SegmentedControl<"percent" | "amount">
                label="Down payment input"
                value={downMode}
                onChange={setDownMode}
                options={[
                  { value: "percent", label: "Percent of price" },
                  { value: "amount", label: "Dollar amount" },
                ]}
              />
            </div>
            {downMode === "percent" ? (
              <NumberField
                id="down-pct"
                label="Down payment"
                value={downPct}
                onChange={setDownPct}
                suffix="%"
                placeholder="20"
                hint={`${programForForm.name} requires at least ${(minDownPct * 100).toFixed(1)}% down.`}
              />
            ) : (
              <NumberField
                id="down-amt"
                label="Down payment"
                value={downAmount}
                onChange={setDownAmount}
                prefix="$"
                placeholder="130,000"
                hint={`${programForForm.name} requires at least ${(minDownPct * 100).toFixed(1)}% down.`}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Loan</CardTitle>
            <CardDescription>
              The loan program drives mortgage insurance and financed fees.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField<LoanProgramId>
              id="program"
              label="Loan program"
              value={loanProgramId}
              onChange={setLoanProgramId}
              options={LOAN_PROGRAM_LIST.map((p) => ({
                value: p.id,
                label: `${p.name} (min ${(getMinDownPct(p, "single") * 100).toFixed(1)}% down)`,
              }))}
            />
            <SelectField<string>
              id="credit-tier"
              label="Credit score range (optional)"
              value={creditTierId}
              onChange={setCreditTierId}
              options={[
                { value: "none", label: "Prefer not to say" },
                ...CREDIT_TIERS.map((t) => ({ value: t.id, label: t.label })),
              ]}
              hint="Only adjusts the illustrative rate — never your numbers directly."
            />
            <NumberField
              id="rate"
              label="Interest rate assumption"
              value={annualRatePct}
              onChange={setAnnualRatePct}
              suffix="%"
              placeholder="6.5"
            />
            <SelectField<string>
              id="term"
              label="Loan term"
              value={loanTermYears}
              onChange={setLoanTermYears}
              options={[
                { value: "30", label: "30 years" },
                { value: "20", label: "20 years" },
                { value: "15", label: "15 years" },
                { value: "10", label: "10 years" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-5 text-pastel-mint-ink" aria-hidden />
              Ongoing costs
            </CardTitle>
            <CardDescription>
              NYC property taxes and insurance vary widely — enter your best
              estimates.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="tax"
              label="Property tax (annual)"
              value={annualPropertyTax}
              onChange={setAnnualPropertyTax}
              prefix="$"
            />
            <NumberField
              id="insurance"
              label="Insurance (annual)"
              value={annualInsurance}
              onChange={setAnnualInsurance}
              prefix="$"
            />
            <NumberField
              id="hoa"
              label="HOA / maintenance (monthly)"
              value={monthlyHOA}
              onChange={setMonthlyHOA}
              prefix="$"
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
          Calculate my monthly cost
        </Button>
        <p className="mt-2 text-[13px] text-muted">
          Runs the numbers with everything you entered above.
        </p>
      </div>

      {/* NYC area-variance note — always visible, not collapsible. */}
      {result && (
        <p className="mt-6 flex items-start gap-1.5 text-[13px] text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Estimates can vary by neighborhood — property taxes, insurance
            costs, and HOA/maintenance fees differ across NYC boroughs and
            surrounding areas. The figures above use the values you entered.
          </span>
        </p>
      )}

      {/* Assumptions */}
      {result && (
        <Card className="mt-6">
          <button
            type="button"
            onClick={() => setAssumptionsOpen((v) => !v)}
            aria-expanded={assumptionsOpen}
            className="flex w-full items-center justify-between p-6 text-left"
          >
            <span className="text-base font-semibold text-foreground">
              Assumptions & sources
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
                This calculator does not approve, pre-approve, or guarantee
                any loan. Real costs depend on the final loan terms,
                appraisal, and negotiations — consult a licensed mortgage
                professional before making decisions.
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </Container>
  );
}
