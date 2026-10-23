"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  ChevronDown,
  Info,
  MapPin,
  ShieldCheck,
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
  DEFAULT_CLOSING_COST_PCT,
  qualifyBuyer,
  sensitivity,
  type BuyerQualificationInputs,
  type LoanProgramId,
  type QualificationResult,
  type ValidationIssue,
} from "@/lib/calculators/buyer-qualification";
import {
  CREDIT_TIERS,
  LOAN_PROGRAMS,
  LOAN_PROGRAM_LIST,
  PROPERTY_TYPES,
  getMinDownPct,
  propertyTypeLabel,
  type PropertyType,
} from "@/lib/calculators/loan-programs";
import { NumberField, SelectField, SegmentedControl } from "./fields";
import { DscrCalculator } from "./dscr-calculator";

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
const pct1 = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
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

function BreakdownRows({ active }: { active: QualificationResult }) {
  const rows: [string, number][] = [
    ["Principal & interest", active.monthly.principalAndInterest],
    ["Property tax", active.monthly.propertyTax],
    ["Homeowners insurance", active.monthly.insurance],
    ["HOA / maintenance", active.monthly.hoa],
  ];
  if (active.monthly.mortgageInsurance > 0) {
    rows.push(["Mortgage insurance", active.monthly.mortgageInsurance]);
  }
  return (
    <div className="mt-5 rounded-xl border border-border">
      {rows.map(([label, value], i) => (
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
            <span className="font-normal text-muted">/mo</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function DtiBar({ label, value, cap }: { label: string; value: number; cap: number }) {
  const width = Math.min(100, (value / Math.max(cap, 0.01)) * 100);
  const over = value > cap + 1e-9;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted">
          {pct1.format(value)}{" "}
          <span className="text-muted/70">/ {pct1.format(cap)} max</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-pastel-peach-ink" : "bg-accent",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calculator                                                          */
/* ------------------------------------------------------------------ */

/** Plain-language explanation of which input caps the estimate. */
function bindingExplainer(
  constraint: QualificationResult["bindingConstraint"],
): string {
  switch (constraint) {
    case "cash available":
      return "The cash you have available — more savings (or a smaller down payment) would raise this number.";
    case "back-end DTI":
      return "Your total monthly debts compared to your income — paying down debts would raise this number; adding savings won't.";
    default:
      return "How much of your income can go to housing — higher income or a lower rate would raise this number; adding savings won't.";
  }
}

type ScenarioKey = "conservative" | "higher";

/** The original income/DTI calculator (mode: "With my income"). */
function IncomeBuyingPower() {
  // ---- form state (raw strings for text inputs) ----
  const [annualIncome, setAnnualIncome] = useState("120000");
  const [monthlyDebts, setMonthlyDebts] = useState("500");
  const [savings, setSavings] = useState("100000");
  const [downMode, setDownMode] = useState<"percent" | "amount">("percent");
  const [downPct, setDownPct] = useState("10");
  const [downAmount, setDownAmount] = useState("60000");
  const [loanProgramId, setLoanProgramId] = useState<LoanProgramId>("conventional");
  const [creditTierId, setCreditTierId] = useState<string>("none");
  const [propertyType, setPropertyType] = useState<PropertyType>("single");
  const [monthlyRentalIncome, setMonthlyRentalIncome] = useState("");
  const [annualRatePct, setAnnualRatePct] = useState("6.5");
  const [loanTermYears, setLoanTermYears] = useState("30");
  const [annualPropertyTax, setAnnualPropertyTax] = useState("6000");
  const [annualInsurance, setAnnualInsurance] = useState("1800");
  const [monthlyHOA, setMonthlyHOA] = useState("0");

  const [scenario, setScenario] = useState<ScenarioKey>("higher");
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  // Minimum down payment for the chosen program + property type
  // (e.g. conventional needs 15% on 2-units, 25% on 3–4 units).
  const programForForm = LOAN_PROGRAMS[loanProgramId];
  const minDownForUnits = getMinDownPct(programForForm, propertyType);
  const unitDownHint =
    propertyType === "single"
      ? undefined
      : `${programForForm.name} requires at least ${(minDownForUnits * 100).toFixed(1)}% down on ${propertyTypeLabel(propertyType)} properties (illustrative).`;

  // ---- draft → applied: the form edits drafts; results only recalculate
  // when the user taps Calculate. ----
  const draftFields = [
    annualIncome, monthlyDebts, savings, downMode, downPct, downAmount,
    creditTierId, loanProgramId, annualRatePct, loanTermYears,
    annualPropertyTax, annualInsurance, monthlyHOA, propertyType,
    monthlyRentalIncome,
  ];

  function buildInputs(): BuyerQualificationInputs {
    return {
      annualIncome: parseNum(annualIncome),
      monthlyDebts: parseOrZero(monthlyDebts),
      savings: parseOrZero(savings),
      downPayment:
        downMode === "percent"
          ? { mode: "percent", pct: parseNum(downPct) }
          : { mode: "amount", amount: parseOrZero(downAmount) },
      creditTierId: creditTierId === "none" ? undefined : creditTierId,
      loanProgramId,
      annualRatePct: parseNum(annualRatePct),
      loanTermYears: parseInt(loanTermYears, 10),
      annualPropertyTax: parseOrZero(annualPropertyTax),
      annualInsurance: parseOrZero(annualInsurance),
      monthlyHOA: parseOrZero(monthlyHOA),
      closingCostPct: DEFAULT_CLOSING_COST_PCT,
      propertyType,
      monthlyRentalIncome: parseOrZero(monthlyRentalIncome),
    };
  }

  const [appliedInputs, setAppliedInputs] = useState<BuyerQualificationInputs>(
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
    const check = qualifyBuyer(inputs);
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

  const outcome = useMemo(
    () => qualifyBuyer(appliedInputs),
    [appliedInputs],
  );

  const sens = useMemo(() => {
    if (!outcome.ok) return null;
    const r = sensitivity(appliedInputs);
    return r.ok ? r : null;
  }, [outcome.ok, appliedInputs]);

  const active: QualificationResult | null =
    outcome.ok
      ? scenario === "conservative"
        ? outcome.value.conservative
        : outcome.value.higher
      : null;

  const sensGroups = useMemo(() => {
    if (!sens) return [];
    const order = ["Interest rate", "Down payment", "Monthly debts", "Savings"];
    return order
      .map((label) => ({
        label,
        rows: sens.rows.filter((r) => r.label === label),
      }))
      .filter((g) => g.rows.length > 0);
  }, [sens]);

  return (
    <>
      {/* Multifamily rental-income callout (income mode only) */}
      <div className="mb-6 rounded-xl border border-pastel-mint-ink/30 bg-pastel-mint/50 p-3.5">
        <p className="text-sm leading-snug">
          <strong className="font-bold text-foreground">
            Buying a 2–4 unit home?
          </strong>{" "}
          <span className="text-muted">
            Select multifamily below — 75% of the rental income you enter
            counts toward your buying power.
          </span>
        </p>
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
      {outcome.ok && (
        <div ref={resultsRef} className="scroll-mt-4">
        <Card className="mb-6 overflow-hidden">
          <div className="bg-accent-soft px-6 pb-6 pt-6">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">
              Estimated affordable price range
            </p>
            <p className="mt-1 text-[32px] font-bold leading-none tracking-tight text-foreground sm:text-4xl">
              {usd0.format(outcome.value.conservative.maxPrice)}
              <span className="text-muted"> – </span>
              {usd0.format(outcome.value.higher.maxPrice)}
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
              Conservative to higher qualification scenarios. Your information
              stays on this device — nothing is sent anywhere.
            </p>
          </div>
          <CardContent className="p-6 pt-5">
            <SegmentedControl<ScenarioKey>
              label="Scenario"
              value={scenario}
              onChange={setScenario}
              options={[
                { value: "conservative", label: "Conservative" },
                { value: "higher", label: "Higher" },
              ]}
            />
            {active && (
              <div className="mt-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-background p-3.5">
                    <p className="text-xs text-muted">Max price</p>
                    <p className="mt-0.5 text-lg font-bold text-foreground">
                      {usd0.format(active.maxPrice)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-background p-3.5">
                    <p className="text-xs text-muted">Mortgage amount</p>
                    <p className="mt-0.5 text-lg font-bold text-foreground">
                      {usd0.format(active.mortgageAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-background p-3.5">
                    <p className="text-xs text-muted">Monthly payment</p>
                    <p className="mt-0.5 text-lg font-bold text-foreground">
                      {usd0.format(active.monthly.total)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-background p-3.5">
                    <p className="text-xs text-muted">Cash to close</p>
                    <p className="mt-0.5 text-lg font-bold text-foreground">
                      {usd0.format(active.cashToClose)}
                    </p>
                  </div>
                </div>

                {/* Monthly breakdown */}
                <BreakdownRows active={active} />

                {/* DTI */}
                <div className="mt-5 space-y-4">
                  <DtiBar
                    label="Front-end DTI (housing)"
                    value={active.frontEndDTI}
                    cap={
                      scenario === "conservative"
                        ? outcome.value.program.conservativeDtiCaps.front
                        : outcome.value.program.dtiCaps.front
                    }
                  />
                  <DtiBar
                    label="Back-end DTI (all debts)"
                    value={active.backEndDTI}
                    cap={
                      scenario === "conservative"
                        ? outcome.value.program.conservativeDtiCaps.back
                        : outcome.value.program.dtiCaps.back
                    }
                  />
                </div>

                <p className="mt-4 flex items-start gap-1.5 text-[13px] text-muted">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <strong className="font-semibold text-foreground">
                      What limits this number?{" "}
                    </strong>
                    {bindingExplainer(active.bindingConstraint)}
                  </span>
                </p>
                <p className="mt-2 text-[13px] text-muted">
                  Rate used: {active.effectiveRatePct.toFixed(2)}%. Qualifying
                  income: {usd0.format(active.effectiveMonthlyIncome)}/mo
                  {active.rentalIncomeCounted > 0 && (
                    <>
                      {" "}(includes {usd0.format(active.rentalIncomeCounted)}{" "}
                      counted rent)
                    </>
                  )}
                  .
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      )}

      {/* Contact CTA — directly under results, before toggles/inputs. */}
      {outcome.ok && (
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

      {/* NYC area-variance note — always visible, not collapsible. */}
      {outcome.ok && (
        <p className="mb-6 flex items-start gap-1.5 text-[13px] text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Estimates can vary by neighborhood — property taxes, insurance
            costs, and HOA/maintenance fees differ across NYC boroughs and
            surrounding areas. The figures above use the values you entered.
          </span>
        </p>
      )}

      {/* Visible disclaimer — reads without opening the assumptions panel.
          A second copy lives inside the panel (belt and suspenders). */}
      {outcome.ok && active && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
          <Info
            className="mt-0.5 size-4 shrink-0 text-muted"
            aria-hidden
          />
          <p className="text-[13px] leading-snug text-muted">
            <strong className="font-semibold text-foreground">
              Estimates only — not a loan approval or preapproval.
            </strong>{" "}
            Real qualification depends on a lender&apos;s full underwriting.
            Consult a licensed mortgage professional before making decisions.
          </p>
        </div>
      )}

      {/* Form */}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-5 text-pastel-mint-ink" aria-hidden />
              Your finances
            </CardTitle>
            <CardDescription>
              Gross figures — the math uses standard debt-to-income ratios.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="income"
              label="Annual gross household income"
              value={annualIncome}
              onChange={setAnnualIncome}
              prefix="$"
              placeholder="120,000"
            />
            <NumberField
              id="debts"
              label="Monthly debt payments"
              value={monthlyDebts}
              onChange={setMonthlyDebts}
              prefix="$"
              hint="Car loans, student loans, credit cards — not housing."
            />
            <div className="sm:col-span-2">
              <NumberField
                id="savings"
                label="Available savings"
                value={savings}
                onChange={setSavings}
                prefix="$"
                hint="Cash you could put toward down payment + closing costs."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Down payment & loan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SegmentedControl<PropertyType>
                label="Property type"
                value={propertyType}
                onChange={setPropertyType}
                options={PROPERTY_TYPES.map((p) => ({
                  value: p.id,
                  label: p.label,
                }))}
              />
            </div>
            {propertyType !== "single" && (
              <div className="sm:col-span-2">
                <NumberField
                  id="rental-income"
                  label="Monthly rental income from the other unit(s)"
                  value={monthlyRentalIncome}
                  onChange={setMonthlyRentalIncome}
                  prefix="$"
                  placeholder="2,000"
                  hint="Your estimate — 75% counts toward qualifying income. Lenders verify with signed leases or an appraisal."
                />
              </div>
            )}
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
                placeholder="10"
                hint={unitDownHint}
              />
            ) : (
              <NumberField
                id="down-amt"
                label="Down payment"
                value={downAmount}
                onChange={setDownAmount}
                prefix="$"
                placeholder="60,000"
                hint={unitDownHint}
              />
            )}
            <SelectField<LoanProgramId>
              id="program"
              label="Loan program"
              value={loanProgramId}
              onChange={setLoanProgramId}
              options={LOAN_PROGRAM_LIST.map((p) => ({
                value: p.id,
                label: `${p.name} (min ${(getMinDownPct(p, propertyType) * 100).toFixed(1)}% down)`,
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
              hint="Only adjusts the illustrative rate — never your buying power directly."
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
            <CardTitle className="text-base">Ongoing costs</CardTitle>
            <CardDescription>
              NYC property taxes vary widely by property type — enter your best
              estimate; it only affects the monthly total, not the price solve
              beyond that.
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
          Calculate my buying power
        </Button>
        <p className="mt-2 text-[13px] text-muted">
          Runs the numbers with everything you entered above.
        </p>
      </div>

      {/* What-if sensitivity */}
      {sens && sensGroups.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">What-if scenarios</CardTitle>
            <CardDescription>
              How the higher-scenario max price ({usd0.format(sens.baselineMaxPrice)})
              moves when one factor changes at a time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sensGroups.map((g) => (
              <div key={g.label}>
                <p className="mb-1.5 text-[13px] font-semibold text-foreground">
                  {g.label}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {g.rows.map((r) => (
                    <div
                      key={r.change}
                      className="rounded-xl bg-background px-3.5 py-2.5"
                    >
                      <p className="text-xs text-muted">{r.change}</p>
                      <p className="text-[15px] font-bold text-foreground">
                        {usd0.format(r.newMaxPrice)}
                      </p>
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          r.delta > 0
                            ? "text-pastel-mint-ink"
                            : r.delta < 0
                              ? "text-pastel-peach-ink"
                              : "text-muted",
                        )}
                      >
                        {r.delta > 0 ? "+" : r.delta < 0 ? "−" : ""}
                        {r.delta === 0
                          ? "No change"
                          : usd0.format(Math.abs(r.delta))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Assumptions */}
      {outcome.ok && (
        <Card className="mt-6">
          <button
            type="button"
            onClick={() => setAssumptionsOpen((v) => !v)}
            aria-expanded={assumptionsOpen}
            className="flex w-full items-center justify-between p-6 text-left"
          >
            <span className="text-base font-semibold text-foreground">
              Assumptions & limitations
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
                {(scenario === "conservative"
                  ? outcome.value.conservative.assumptions
                  : outcome.value.higher.assumptions
                ).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <div className="mt-4 rounded-xl bg-pastel-peach/40 p-4 text-[13px] text-muted">
                <strong className="font-semibold text-foreground">
                  Estimates only.
                </strong>{" "}
                This calculator does not approve, pre-approve, or guarantee any
                loan. Real qualification depends on a lender&apos;s full underwriting —
                consult a licensed mortgage professional before making decisions.
              </div>
            </CardContent>
          )}
        </Card>
      )}

    </>
  );
}

/* ------------------------------------------------------------------ */
/* Page shell — mode toggle between the income (DTI) calculator and   */
/* the investor (DSCR) calculator. Both stay mounted (the inactive    */
/* one is hidden) so neither form loses its state when switching.     */
/* ------------------------------------------------------------------ */

type BuyingMode = "income" | "dscr";

export function BuyingPowerCalculator() {
  const [mode, setMode] = useState<BuyingMode>("income");
  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          How Much Can I Buy?
        </h1>
        <p className="mt-2 flex items-start gap-1.5 text-[15px] text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Get an estimate based on your financial situation.{" "}
            <strong className="font-semibold text-foreground">
              This is not a loan approval.
            </strong>
          </span>
        </p>
        <div className="mt-5">
          <SegmentedControl<BuyingMode>
            label="How are you buying?"
            value={mode}
            onChange={setMode}
            options={[
              { value: "income", label: "With my income" },
              { value: "dscr", label: "As an investor · DSCR" },
            ]}
          />
        </div>
      </div>

      <div className={mode === "income" ? undefined : "hidden"}>
        <IncomeBuyingPower />
      </div>
      <div className={mode === "dscr" ? undefined : "hidden"}>
        <DscrCalculator />
      </div>
    </Container>
  );
}
