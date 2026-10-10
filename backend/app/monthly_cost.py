"""
True Monthly Cost Calculator — pure calculation engine.

Faithful Python port of `lib/calculators/monthly-cost.ts` (Stage 4).

Computes the monthly cost breakdown (P&I, tax, insurance, MI, HOA) plus a
cash-to-close estimate with an illustrative NYC closing-cost model:
mortgage recording tax (borrower-paid portion), mansion tax, title
insurance, attorney fee, plus an illustrative lender & third-party fees
(misc.) allowance calibrated so total buyer closing costs land at ≈3.5%
of price.

Mortgage-insurance rules are the Stage 3 configs — reused, not duplicated.
All figures are ESTIMATES. Nothing here is, or implies, a loan approval.
"""

from __future__ import annotations

from ._numeric import is_int, is_num, round2
from .buying_power import monthly_payment
from .loan_programs import LOAN_PROGRAMS, get_credit_tier, get_min_down_pct

# ---------------------------------------------------------------------------
# NYC closing-cost model constants
# ---------------------------------------------------------------------------

MRT_BRACKET = 500000
MRT_RATE_UNDER_500K = 0.018
MRT_RATE_500K_PLUS = 0.01925


def recording_tax(loan_amount: float) -> float:
    """NYC mortgage recording tax — BORROWER-PAID portion only, on the loan."""
    if not is_num(loan_amount) or loan_amount <= 0:
        return 0.0
    rate = MRT_RATE_UNDER_500K if loan_amount < MRT_BRACKET else MRT_RATE_500K_PLUS
    return loan_amount * rate


MANSION_TIERS = [
    {"min": 25_000_000, "rate": 0.039},
    {"min": 20_000_000, "rate": 0.0375},
    {"min": 15_000_000, "rate": 0.035},
    {"min": 10_000_000, "rate": 0.0325},
    {"min": 5_000_000, "rate": 0.0225},
    {"min": 3_000_000, "rate": 0.015},
    {"min": 2_000_000, "rate": 0.0125},
    {"min": 1_000_000, "rate": 0.01},
]


def mansion_tax_rate(price: float) -> float | None:
    """Buyer-side mansion-tax rate on the ENTIRE price (None below $1M)."""
    for t in MANSION_TIERS:
        if price >= t["min"]:
            return t["rate"]
    return None


def mansion_tax(price: float) -> float:
    rate = mansion_tax_rate(price)
    return 0.0 if rate is None else price * rate


TITLE_INSURANCE_PCT = 0.0045
ATTORNEY_FEE = 3500
ATTORNEY_FEE_RANGE = "$2,000–$5,000"
MISC_CLOSING_TARGET_PCT = 0.035


# ---------------------------------------------------------------------------
# Validation (mirrors validateInputs — same fields, codes, messages)
# ---------------------------------------------------------------------------

def _issue(field: str, code: str, message: str) -> dict:
    return {"field": field, "code": code, "message": message}


def validate_inputs(inputs: dict) -> dict:
    issues: list[dict] = []

    if not is_num(inputs.get("purchasePrice")) or inputs["purchasePrice"] <= 0:
        issues.append(_issue("purchasePrice", "INVALID_PRICE", "Purchase price must be greater than $0."))

    program = LOAN_PROGRAMS.get(inputs.get("loanProgramId"))
    if not program:
        issues.append(_issue("loanProgramId", "UNKNOWN_PROGRAM", "Unknown loan program."))
    else:
        # Stage 4 has no property-type input; single-family minimums apply.
        min_down = get_min_down_pct(program, "single")
        min_down_label = f"{min_down * 100:.1f}%"
        dp = inputs.get("downPayment") or {}
        if dp.get("mode") == "percent":
            if not is_num(dp.get("pct")) or dp["pct"] < 0 or dp["pct"] > 100:
                issues.append(_issue("downPayment", "INVALID_DOWN_PAYMENT", "Down payment must be between 0% and 100%."))
            elif dp["pct"] / 100 < min_down:
                issues.append(_issue("downPayment", "BELOW_PROGRAM_MINIMUM", f"{program['name']} requires at least {min_down_label} down."))
        else:
            if not is_num(dp.get("amount")) or dp["amount"] < 0:
                issues.append(_issue("downPayment", "INVALID_DOWN_PAYMENT", "Down payment can't be negative."))
            elif is_num(inputs.get("purchasePrice")):
                if dp["amount"] > inputs["purchasePrice"]:
                    issues.append(_issue("downPayment", "DOWN_PAYMENT_EXCEEDS_PRICE", "Down payment can't exceed the purchase price."))
                elif dp["amount"] / inputs["purchasePrice"] < min_down:
                    issues.append(_issue("downPayment", "BELOW_PROGRAM_MINIMUM", f"{program['name']} requires at least {min_down_label} down."))

    tier_id = inputs.get("creditTierId")
    if tier_id is not None and get_credit_tier(tier_id) is None:
        issues.append(_issue("creditTierId", "UNKNOWN_TIER", "Unknown credit score range."))
    if not is_num(inputs.get("annualRatePct")) or not (0 <= inputs["annualRatePct"] <= 25):
        issues.append(_issue("annualRatePct", "INVALID_RATE", "Interest rate must be between 0% and 25%."))
    if not is_int(inputs.get("loanTermYears")) or not (1 <= inputs["loanTermYears"] <= 40):
        issues.append(_issue("loanTermYears", "INVALID_TERM", "Loan term must be a whole number of years (1–40)."))
    for field in ("annualPropertyTax", "annualInsurance", "monthlyHOA"):
        v = inputs.get(field)
        if not is_num(v) or v < 0:
            issues.append(_issue(field, "INVALID_AMOUNT", f"{field} can't be negative."))

    return {"ok": True} if not issues else {"ok": False, "issues": issues}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_monthly_cost(inputs: dict) -> dict:
    validation = validate_inputs(inputs)
    if not validation["ok"]:
        return validation

    program = LOAN_PROGRAMS[inputs["loanProgramId"]]
    tier = get_credit_tier(inputs.get("creditTierId"))
    tier_adj = tier["rateAdjustmentPct"] if tier else 0.0
    effective_rate_pct = max(0.0, inputs["annualRatePct"] + tier_adj)

    price = inputs["purchasePrice"]
    dp_in = inputs["downPayment"]
    if dp_in["mode"] == "percent":
        down_pct = dp_in["pct"] / 100
    else:
        down_pct = min(1.0, dp_in["amount"] / price) if price > 0 else 0.0
    if dp_in["mode"] == "percent":
        down_payment_amount = price * down_pct
    else:
        down_payment_amount = min(dp_in["amount"], price)

    mi = program["mortgageInsurance"]
    upfront = mi.get("upfrontFinancedPct") or 0.0
    base_loan = max(0.0, price - down_payment_amount)
    mortgage_amount = base_loan * (1 + upfront)

    p_and_i = monthly_payment(mortgage_amount, effective_rate_pct, inputs["loanTermYears"])
    tax = inputs["annualPropertyTax"] / 12
    ins = inputs["annualInsurance"] / 12
    hoa = inputs["monthlyHOA"]
    if mi["kind"] == "pmi":
        mi_applies = down_pct < mi.get("threshold", 0.2)
    else:
        mi_applies = mi["kind"] == "fha-mip"
    mi_monthly = (mortgage_amount * (mi.get("annualRate") or 0.0)) / 12 if mi_applies else 0.0

    monthly = {
        "principalAndInterest": round2(p_and_i),
        "propertyTax": round2(tax),
        "insurance": round2(ins),
        "hoa": round2(hoa),
        "mortgageInsurance": round2(mi_monthly),
        "total": round2(p_and_i + tax + ins + hoa + mi_monthly),
    }

    # --- Closing costs (illustrative NYC model) ---
    recording_tax_amount = round2(recording_tax(mortgage_amount))
    mansion_rate = mansion_tax_rate(price)
    mansion_tax_amount = round2(mansion_tax(price))
    title_amount = round2(price * TITLE_INSURANCE_PCT)
    attorney_amount = round2(ATTORNEY_FEE)
    misc_amount = round2(
        max(
            0.0,
            price * MISC_CLOSING_TARGET_PCT
            - (recording_tax_amount + mansion_tax_amount + title_amount + attorney_amount),
        )
    )

    closing_costs = [
        {
            "label": "Mortgage recording tax (borrower portion)",
            "amount": recording_tax_amount,
            "source": (
                "NYC MRT borrower-paid share: 1.80% of the loan under $500,000, "
                "1.925% at $500,000+ (lender pays the other 0.25%) — NYS Tax Law; "
                "NYS Form MT-15, NYC Dept. of Finance."
            ),
            "illustrative": False,
        },
    ]
    if mansion_rate is not None:
        closing_costs.append(
            {
                "label": f"Mansion tax ({mansion_rate * 100:.2f}% of full price)",
                "amount": mansion_tax_amount,
                "source": (
                    "Buyer-paid; 1% statewide (NYS Tax Law §1402-a) + NYC graduated "
                    "supplemental §1402-b: 1% at $1–2M … 3.90% at $25M+. Rate applies "
                    "to the entire price, not just the amount over the threshold."
                ),
                "illustrative": False,
            }
        )
    closing_costs.append(
        {
            "label": "Title insurance (illustrative)",
            "amount": title_amount,
            "source": (
                "Illustrative 0.45% of price — industry rule of thumb; actual premiums "
                "follow the NY-regulated TIRSA schedule and vary by insurer and endorsements."
            ),
            "illustrative": True,
        }
    )
    closing_costs.append(
        {
            "label": "Attorney fee (illustrative)",
            "amount": attorney_amount,
            "source": f"Illustrative flat fee; typical NYC buyer range {ATTORNEY_FEE_RANGE}.",
            "illustrative": True,
        }
    )
    if misc_amount > 0:
        closing_costs.append(
            {
                "label": "Lender & third-party fees (misc., illustrative)",
                "amount": misc_amount,
                "source": (
                    "Illustrative allowance for lender origination/underwriting/processing, "
                    "appraisal, and credit/flood reports, plus the home inspection — "
                    "inspection and appraisal are typically paid out of pocket BEFORE "
                    "closing day. Calibrated so total buyer closing costs ≈ 3.5% of price, "
                    "a realistic all-in NYC estimate; actual fees vary by lender."
                ),
                "illustrative": True,
            }
        )

    closing_costs_total = round2(sum(l["amount"] for l in closing_costs))
    cash_to_close = round2(down_payment_amount + closing_costs_total)

    assumptions = [
        f"Loan program: {program['name']} — {program['source']} (effective {program['effectiveDate']}).",
        program["note"],
        (
            f"Mortgage insurance ({program['name']}): {mi['description']}"
            if mi_applies
            else f"No monthly mortgage insurance ({program['name']})."
        ),
        (
            f"{upfront * 100:.2f}% one-time fee financed into the loan (raises the recorded loan amount and the recording tax base)."
            if upfront > 0
            else None
        ),
        f"Credit tier adds +{tier_adj:.2f}% illustrative pricing adjustment (not a multiplier, not an approval factor)."
        if tier_adj > 0
        else f"No credit-tier adjustment applied{'' if inputs.get('creditTierId') else ' (no range selected)'}.",
        *[f"{l['label']}: {l['source']}" for l in closing_costs],
        "No mansion tax below $1M." if price < 1_000_000 else None,
        (
            "Closing costs already meet or exceed the illustrative 3.5%-of-price benchmark, "
            "so no misc. lender & third-party fee allowance was added."
            if misc_amount == 0
            else None
        ),
        "Closing-cost model assumes a condo/house purchase: co-op share loans record no real-property mortgage (no mortgage recording tax; UCC-1 filing instead).",
        "Co-op flip tax is building-specific and EXCLUDED from this estimate.",
        "The full closing-cost model is illustrative — actual fees vary by lender, attorney, and title company.",
        "Figures are estimates — not a loan approval or preapproval. Consult a licensed mortgage professional before making decisions.",
    ]
    assumptions = [s for s in assumptions if s]

    return {
        "ok": True,
        "value": {
            "purchasePrice": round2(price),
            "downPaymentAmount": round2(down_payment_amount),
            "downPct": down_pct,
            "mortgageAmount": round2(mortgage_amount),
            "effectiveRatePct": effective_rate_pct,
            "monthly": monthly,
            "closingCosts": closing_costs,
            "closingCostsTotal": closing_costs_total,
            "cashToClose": cash_to_close,
            "mansionTaxRate": mansion_rate,
            "assumptions": assumptions,
        },
    }
