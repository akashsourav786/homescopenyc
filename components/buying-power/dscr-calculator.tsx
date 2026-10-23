"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calculator,
  ChevronDown,
  Info,
  MapPin,
  ShieldCheck,
  Wallet,
} from "lucide-react";
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
  DSCR_GUIDANCE_NOTES,
  DSCR_RULES,
  qualifyDscr,
  type DscrInputs,
  type DscrScenarioResult,
  type ValidationIssue,
} from "@/lib/calculators/dscr";
import { NumberField, SelectField, SegmentedControl } from "./fields";

/* ------------------------------------------------------------------ */
/* Helpers (mirrors buying-power-calculator.tsx)                       */
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

function MoneyRows({
  rows,
  monthly = true,
}: {
  rows: { label: string; value: number; total?: boolean }[];
  /** When true, non-total rows get a "/mo" suffix (PITIA); closing costs pass false. */
  monthly?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={cn(
            "flex items-center justify-between px-4 py-2.5 text-sm",
            i < rows.length - 1 && "border-b border-border",
            row.total && "bg-background font-semibold",
          )}
        >
          <span className={row.total ? "text-foreground" : "text-muted"}>
            {row.label}
          </span>
          <span className="font-semibold text-foreground">
            {usd2.format(row.value)}
            {monthly && !row.total && (
              <span className="font-normal text-muted">/mo</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DSCR calculator (investor mode)                                     */
/* ------------------------------------------------------------------ */

const TARGET_OPTIONS = DSCR_RULES.ratioLadder.map((r) => ({
  value: String(r),
  label: r.toFixed(2),
}));

export function DscrCalculator() {
  // ---- form state (raw strings for text inputs) ----
  const [monthlyRent, setMonthlyRent] = useState("7500");
  const [monthlyTaxes, setMonthlyTaxes] = useState("1000");
  const [monthlyInsurance, setMonthlyInsurance] = useState("350");
  const [monthlyHOA, setMonthlyHOA] = useState("0");
  const [downMode, setDownMode] = useState<"amount" | "percent">("amount");
  const [downAmount, setDownAmount] = useState("250000");
  const [downPct, setDownPct] = useState("25");
  const [annualRatePct, setAnnualRatePct] = useState(
    String(DSCR_RULES.defaultRatePct),
  );
  const [loanTermYears, setLoanTermYears] = useState(
    String(DSCR_RULES.defaultTermYears),
  );
  const [targetDscr, setTargetDscr] = useState<string>(
    String(DSCR_RULES.defaultTargetDscr),
  );

  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<number>(
    DSCR_RULES.defaultTargetDscr,
  );

  // ---- draft → applied (same pattern as the income calculator) ----
  const draftFields = [
    monthlyRent, monthlyTaxes, monthlyInsurance, monthlyHOA, downMode,
    downAmount, downPct, annualRatePct, loanTermYears, targetDscr,
  ];

  function buildInputs(): DscrInputs {
    return {
      monthlyRent: parseNum(monthlyRent),
      monthlyTaxes: parseOrZero(monthlyTaxes),
      monthlyInsurance: parseOrZero(monthlyInsurance),
      monthlyHOA: parseOrZero(monthlyHOA),
      downPayment:
        downMode === "amount"
          ? { mode: "amount", amount: parseOrZero(downAmount) }
          : { mode: "percent", pct: parseNum(downPct) },
      annualRatePct: parseNum(annualRatePct),
      loanTermYears: parseInt(loanTermYears, 10),
      targetDscr: parseFloat(targetDscr),
    };
  }

  const [appliedInputs, setAppliedInputs] = useState<DscrInputs>(() =>
    buildInputs(),
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
    const check = qualifyDscr(inputs);
    if (!check.ok) {
      setIssues(check.issues);
      return;
    }
    setIssues([]);
    setAppliedInputs(inputs);
    setAppliedSnapshot(draftFields.join("|"));
    setViewTarget(inputs.targetDscr);
    setCalculatedAt(new Date());
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const outcome = useMemo(() => qualifyDscr(appliedInputs), [appliedInputs]);

  const shown: DscrScenarioResult | null = outcome.ok
    ? (outcome.value.scenarios.find(
        (s) => Math.abs(s.targetDscr - viewTarget) < 1e-9,
      ) ?? outcome.value.selected)
    : null;

  return (
    <div>
      <p className="mb-6 flex items-start gap-1.5 text-[15px] text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          DSCR loans qualify the <strong className="font-semibold text-foreground">property</strong>,
          not your paycheck — no income or DTI check. The rent sizes the loan:
          enter what the property collects and what you can put down, and see
          the most it can carry.{" "}
          <strong className="font-semibold text-foreground">
            This is not a loan approval.
          </strong>
        </span>
      </p>

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
      {outcome.ok && shown && (
        <div ref={resultsRef} className="scroll-mt-4">
          <Card className="mb-6 overflow-hidden">
            <div className="bg-accent-soft px-6 pb-6 pt-6">
              <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                Estimated max price at {shown.targetDscr.toFixed(2)} DSCR
              </p>
              <p className="mt-1 text-[32px] font-bold leading-none tracking-tight text-foreground sm:text-4xl">
                {usd0.format(shown.maxPrice)}
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
                Sized by the rent alone — lender LTV caps are guidance, not a
                cap here. Your information stays on this device — nothing is
                sent anywhere.
              </p>
            </div>
            <CardContent className="p-6 pt-5">
              {/* Ratio ladder — tap a card to inspect that target */}
              <p className="text-[13px] font-semibold text-foreground">
                Max price by target DSCR
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {outcome.value.scenarios.map((s) => {
                  const isShown =
                    Math.abs(s.targetDscr - shown.targetDscr) < 1e-9;
                  return (
                    <button
                      key={s.targetDscr}
                      type="button"
                      onClick={() => setViewTarget(s.targetDscr)}
                      aria-pressed={isShown}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        isShown
                          ? "border-accent bg-accent-soft"
                          : "border-border bg-background hover:border-accent/50",
                      )}
                    >
                      <p className="text-xs text-muted">
                        {s.targetDscr.toFixed(2)} DSCR
                      </p>
                      <p className="mt-0.5 text-base font-bold leading-tight text-foreground sm:text-lg">
                        {usd0.format(s.maxPrice)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Loan {usd0.format(s.maxLoan)}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[13px] text-muted">
                1.00 is the most common approval floor; 1.25 earns the best
                pricing at most lenders. Most approvals land at 25–30% down.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-background p-3.5">
                  <p className="text-xs text-muted">Max loan</p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {usd0.format(shown.maxLoan)}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3.5">
                  <p className="text-xs text-muted">Monthly PITIA</p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {usd0.format(shown.monthly.total)}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3.5">
                  <p className="text-xs text-muted">Down payment</p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {usd0.format(shown.downPaymentAmount)}
                    <span className="ml-1 text-sm font-semibold text-muted">
                      {pct1.format(shown.downPaymentPct)}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3.5">
                  <p className="text-xs text-muted">Cash to close</p>
                  <p className="mt-0.5 text-lg font-bold text-foreground">
                    {usd0.format(shown.cashToClose)}
                  </p>
                </div>
              </div>

              {/* Monthly PITIA breakdown */}
              <p className="mb-2 mt-5 text-[13px] font-semibold text-foreground">
                Monthly cost at that price
              </p>
              <MoneyRows
                rows={[
                  {
                    label: "Principal & interest",
                    value: shown.monthly.principalAndInterest,
                  },
                  { label: "Property tax", value: shown.monthly.propertyTax },
                  { label: "Homeowners insurance", value: shown.monthly.insurance },
                  { label: "HOA / association dues", value: shown.monthly.hoa },
                  { label: "Total PITIA", value: shown.monthly.total, total: true },
                ]}
              />

              {/* Closing-cost estimate */}
              <p className="mb-2 mt-5 text-[13px] font-semibold text-foreground">
                Estimated closing costs (NYC)
              </p>
              <MoneyRows
                monthly={false}
                rows={[
                  ...shown.closingLines.map((l) => ({
                    label: l.label,
                    value: l.amount,
                  })),
                  {
                    label: "Total closing costs",
                    value: shown.closingCostsTotal,
                    total: true,
                  },
                ]}
              />
              <p className="mt-2 text-[13px] text-muted">
                Cash to close = down payment + these closing costs. Lender and
                third-party fees aren&apos;t itemized — budget extra.
              </p>

              <p className="mt-4 flex items-start gap-1.5 text-[13px] text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold text-foreground">
                    What sizes this number?{" "}
                  </strong>
                  The rent. At a {shown.targetDscr.toFixed(2)} target,{" "}
                  {usd0.format(appliedInputs.monthlyRent)}/mo of rent carries{" "}
                  {usd0.format(shown.maxPitia)}/mo of PITIA — that payment, and
                  your down payment, set the price. Nothing else caps it here.
                </span>
              </p>
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

      {/* NYC area-variance note */}
      {outcome.ok && (
        <p className="mb-6 flex items-start gap-1.5 text-[13px] text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Rents, property taxes, and insurance differ across NYC
            neighborhoods — and lenders re-check taxes at the purchase price.
            The figures above use the values you entered.
          </span>
        </p>
      )}

      {/* Visible disclaimer */}
      {outcome.ok && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-border bg-card p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-[13px] leading-snug text-muted">
            <strong className="font-semibold text-foreground">
              Estimates only — not a loan approval or preapproval.
            </strong>{" "}
            DSCR guidelines vary by lender and change often; real
            qualification depends on the property&apos;s verified rent, taxes,
            and a lender&apos;s full underwriting. Consult a licensed mortgage
            professional before making decisions.
          </p>
        </div>
      )}

      {/* Form */}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-5 text-pastel-mint-ink" aria-hidden />
              The property
            </CardTitle>
            <CardDescription>
              What the property collects and what it costs to carry each
              month — DSCR underwriting starts and ends here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <NumberField
                id="dscr-rent"
                label="Gross monthly rent (all units)"
                value={monthlyRent}
                onChange={setMonthlyRent}
                prefix="$"
                placeholder="7,500"
                hint="Signed leases if rented; your best market-rent estimate if vacant — lenders use the lesser of the lease and the appraiser's market rent."
              />
            </div>
            <NumberField
              id="dscr-taxes"
              label="Property tax (monthly)"
              value={monthlyTaxes}
              onChange={setMonthlyTaxes}
              prefix="$"
              placeholder="1,000"
              hint="Monthly amount — divide the annual bill by 12."
            />
            <NumberField
              id="dscr-insurance"
              label="Insurance (monthly)"
              value={monthlyInsurance}
              onChange={setMonthlyInsurance}
              prefix="$"
              placeholder="350"
              hint="Monthly amount — divide the annual premium by 12."
            />
            <NumberField
              id="dscr-hoa"
              label="HOA / association dues (monthly)"
              value={monthlyHOA}
              onChange={setMonthlyHOA}
              prefix="$"
              placeholder="0"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-5 text-pastel-mint-ink" aria-hidden />
              Your money & the loan
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SegmentedControl<"amount" | "percent">
                label="Down payment input"
                value={downMode}
                onChange={setDownMode}
                options={[
                  { value: "amount", label: "Dollar amount" },
                  { value: "percent", label: "Percent of price" },
                ]}
              />
            </div>
            {downMode === "amount" ? (
              <NumberField
                id="dscr-down-amt"
                label="Cash available for down payment"
                value={downAmount}
                onChange={setDownAmount}
                prefix="$"
                placeholder="250,000"
                hint="Most DSCR approvals land at 25–30% down."
              />
            ) : (
              <NumberField
                id="dscr-down-pct"
                label="Down payment"
                value={downPct}
                onChange={setDownPct}
                suffix="%"
                placeholder="25"
                hint="Most DSCR approvals land at 25–30% down."
              />
            )}
            <div>
              <SegmentedControl<string>
                label="Target DSCR"
                value={targetDscr}
                onChange={setTargetDscr}
                options={TARGET_OPTIONS}
              />
              <p className="mt-1.5 text-xs text-muted">
                1.00 = common floor · 1.25 = best pricing
              </p>
            </div>
            <NumberField
              id="dscr-rate"
              label="Interest rate assumption"
              value={annualRatePct}
              onChange={setAnnualRatePct}
              suffix="%"
              placeholder="7.75"
              hint="Illustrative late-2026 DSCR default — real pricing varies by lender, credit, and ratio."
            />
            <SelectField<string>
              id="dscr-term"
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
      </div>

      {/* Calculate */}
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

      {/* Assumptions & guidance */}
      {outcome.ok && shown && (
        <Card className="mt-6">
          <button
            type="button"
            onClick={() => setAssumptionsOpen((v) => !v)}
            aria-expanded={assumptionsOpen}
            className="flex w-full items-center justify-between p-6 text-left"
          >
            <span className="text-base font-semibold text-foreground">
              Assumptions, guidance & limitations
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
                {shown.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <p className="mb-2 mt-5 text-[13px] font-semibold text-foreground">
                Lender guidance (not applied to the math above)
              </p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
                {DSCR_GUIDANCE_NOTES.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              <div className="mt-4 rounded-xl bg-pastel-peach/40 p-4 text-[13px] text-muted">
                <strong className="font-semibold text-foreground">
                  Estimates only.
                </strong>{" "}
                This calculator does not approve, pre-approve, or guarantee
                any loan. Real qualification depends on a lender&apos;s full
                underwriting — consult a licensed mortgage professional
                before making decisions.
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
