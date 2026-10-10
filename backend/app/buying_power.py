"""
Buyer Qualification Calculator — pure calculation engine.

Faithful Python port of `lib/calculators/buyer-qualification.ts` (Stage 3).

The math, in brief:
1. Monthly payment — standard amortization: M = P·r(1+r)^n / ((1+r)^n − 1).
2. Housing budget from DTI — front-end and back-end caps; the tighter binds.
3. Max price (closed form): monthlyCost(P) = P·k + c is linear in P, so
   P = (budget − c) / k, capped by cash: down(P) + P·closingCostPct ≤ savings.
4. Mortgage insurance is program-specific and folded into k / the loan amount.

Both scenarios use the SAME effective rate (base + credit-tier adjustment).
The conservative/higher spread comes from the DTI caps alone — two
underwriting standards on the same loan. There is NO rate cushion.

Inputs/outputs are plain dicts with the same camelCase keys as the
TypeScript interfaces. All figures are ESTIMATES — never a loan approval.
"""

from __future__ import annotations

import math

from ._numeric import is_int, is_num, money, round2
from .loan_programs import (
    CREDIT_TIERS,
    LOAN_PROGRAMS,
    RENTAL_INCOME_HAIRCUT,
    dti_cap_justifications,
    get_credit_tier,
    get_min_down_pct,
    property_type_label,
)

# NYC-typical default closing-cost assumption.
DEFAULT_CLOSING_COST_PCT = 0.03


def rental_income_counted(inputs: dict) -> float:
    """Monthly rental income counted toward qualifying income (75% haircut,
    multifamily only; 0 for single-family)."""
    if inputs.get("propertyType") == "single":
        return 0.0
    v = inputs.get("monthlyRentalIncome", 0)
    if not is_num(v) or v <= 0:
        return 0.0
    return RENTAL_INCOME_HAIRCUT * v


def effective_monthly_income(inputs: dict) -> float:
    """Gross monthly income used for all DTI math (base + counted rental)."""
    return inputs["annualIncome"] / 12 + rental_income_counted(inputs)


def monthly_payment(principal: float, annual_rate_pct: float, years: int) -> float:
    """Standard amortized monthly payment."""
    if not is_num(principal) or principal <= 0:
        return 0.0
    n = int(round(years * 12))
    if n <= 0:
        return 0.0
    r = annual_rate_pct / 100 / 12
    if r == 0:
        return principal / n
    factor = (1 + r) ** n
    return (principal * r * factor) / (factor - 1)


# ---------------------------------------------------------------------------
# Validation (mirrors validateInputs — same fields, codes, messages)
# ---------------------------------------------------------------------------

def _issue(field: str, code: str, message: str) -> dict:
    return {"field": field, "code": code, "message": message}


def validate_inputs(inputs: dict) -> dict:
    issues: list[dict] = []

    if not is_num(inputs.get("annualIncome")) or inputs["annualIncome"] <= 0:
        issues.append(_issue("annualIncome", "INVALID_INCOME", "Annual income must be greater than $0."))
    if not is_num(inputs.get("monthlyDebts")) or inputs["monthlyDebts"] < 0:
        issues.append(_issue("monthlyDebts", "INVALID_DEBTS", "Monthly debts can't be negative."))
    if not is_num(inputs.get("savings")) or inputs["savings"] < 0:
        issues.append(_issue("savings", "INVALID_SAVINGS", "Savings can't be negative."))

    if inputs.get("propertyType") not in ("single", "two-unit", "three-four-unit"):
        issues.append(_issue("propertyType", "UNKNOWN_PROPERTY_TYPE", "Choose single-family, 2-unit, or 3–4 units."))
    if not is_num(inputs.get("monthlyRentalIncome")) or inputs["monthlyRentalIncome"] < 0:
        issues.append(_issue("monthlyRentalIncome", "INVALID_RENTAL_INCOME", "Rental income can't be negative."))

    program = LOAN_PROGRAMS.get(inputs.get("loanProgramId"))
    if not program:
        issues.append(_issue("loanProgramId", "UNKNOWN_PROGRAM", "Unknown loan program."))
    else:
        for key in ("front", "back"):
            v = program["dtiCaps"][key]
            if not (v > 0 and v <= 0.65):
                issues.append(_issue("loanProgramId", "INVALID_DTI_CAP", f"Program {key}-end DTI cap is out of range."))
        min_down = get_min_down_pct(program, inputs.get("propertyType"))
        min_down_label = f"{min_down * 100:.1f}%"
        dp = inputs.get("downPayment") or {}
        if dp.get("mode") == "percent":
            if not is_num(dp.get("pct")) or dp["pct"] < 0 or dp["pct"] > 100:
                issues.append(_issue("downPayment", "INVALID_DOWN_PAYMENT", "Down payment must be between 0% and 100%."))
            elif dp["pct"] / 100 < min_down:
                if inputs.get("propertyType") == "single":
                    msg = f"{program['name']} requires at least {min_down_label} down."
                else:
                    msg = (
                        f"{program['name']} requires at least {min_down_label} down on "
                        f"{property_type_label(inputs['propertyType'])} properties (illustrative)."
                    )
                issues.append(_issue("downPayment", "BELOW_PROGRAM_MINIMUM", msg))
        else:
            if not is_num(dp.get("amount")) or dp["amount"] < 0:
                issues.append(_issue("downPayment", "INVALID_DOWN_PAYMENT", "Down payment can't be negative."))
            elif dp["amount"] > inputs["savings"]:
                issues.append(_issue("downPayment", "DOWN_PAYMENT_EXCEEDS_SAVINGS", "Down payment can't exceed your available savings."))

    tier_id = inputs.get("creditTierId")
    if tier_id is not None and not any(t["id"] == tier_id for t in CREDIT_TIERS):
        issues.append(_issue("creditTierId", "UNKNOWN_TIER", "Unknown credit score range."))
    if not is_num(inputs.get("annualRatePct")) or not (0 <= inputs["annualRatePct"] <= 25):
        issues.append(_issue("annualRatePct", "INVALID_RATE", "Interest rate must be between 0% and 25%."))
    if not is_int(inputs.get("loanTermYears")) or not (1 <= inputs["loanTermYears"] <= 40):
        issues.append(_issue("loanTermYears", "INVALID_TERM", "Loan term must be a whole number of years (1–40)."))
    for field in ("annualPropertyTax", "annualInsurance", "monthlyHOA"):
        v = inputs.get(field)
        if not is_num(v) or v < 0:
            issues.append(_issue(field, "INVALID_AMOUNT", f"{field} can't be negative."))
    if not is_num(inputs.get("closingCostPct")) or not (0 <= inputs["closingCostPct"] <= 0.1):
        issues.append(_issue("closingCostPct", "INVALID_CLOSING_COSTS", "Closing costs must be between 0% and 10% of the price."))

    return {"ok": True} if not issues else {"ok": False, "issues": issues}


# ---------------------------------------------------------------------------
# Internal solve
# ---------------------------------------------------------------------------

def solve_max_price(inputs: dict, program: dict, params: dict, tier_adjustment_pct: float) -> dict:
    monthly_income = effective_monthly_income(inputs)
    effective_rate_pct = max(0.0, inputs["annualRatePct"] + tier_adjustment_pct)

    front_budget = monthly_income * params["frontDTI"]
    back_budget = monthly_income * params["backDTI"] - inputs["monthlyDebts"]
    allowed_housing = max(0.0, min(front_budget, back_budget))
    binding_dti = "front-end DTI" if front_budget <= back_budget else "back-end DTI"

    pmt_per_dollar = monthly_payment(1, effective_rate_pct, inputs["loanTermYears"])
    fixed_monthly = inputs["annualPropertyTax"] / 12 + inputs["annualInsurance"] / 12 + inputs["monthlyHOA"]

    mi = program["mortgageInsurance"]
    upfront = mi.get("upfrontFinancedPct") or 0.0
    financed_factor = (1 + upfront) * pmt_per_dollar

    dp_in = inputs["downPayment"]
    if dp_in["mode"] == "percent":
        dp = dp_in["pct"] / 100
        if mi["kind"] == "pmi" and dp < mi.get("threshold", 1):
            mi_annual = mi.get("annualRate") or 0.0
        elif mi["kind"] == "fha-mip":
            mi_annual = mi.get("annualRate") or 0.0
        else:
            mi_annual = 0.0
        k = (1 - dp) * (financed_factor + mi_annual / 12)
        price_from_dti = (allowed_housing - fixed_monthly) / k if k > 0 else math.inf
    else:
        down_amt = dp_in["amount"]

        def solve_with(mi_annual: float) -> float:
            k = financed_factor + mi_annual / 12
            return down_amt + (allowed_housing - fixed_monthly) / k if k > 0 else math.inf

        pmi_annual = (mi.get("annualRate") or 0.0) if mi["kind"] == "pmi" else 0.0
        fha_annual = (mi.get("annualRate") or 0.0) if mi["kind"] == "fha-mip" else 0.0
        no_pmi = solve_with(fha_annual)
        threshold = mi.get("threshold", 0.2)
        if (
            mi["kind"] == "pmi"
            and math.isfinite(no_pmi)
            and no_pmi > 0
            and down_amt / no_pmi < threshold
        ):
            price_from_dti = solve_with(fha_annual + pmi_annual)
        else:
            price_from_dti = no_pmi

    # Cash cap: down + price·closingCostPct ≤ savings.
    if dp_in["mode"] == "percent":
        dp = dp_in["pct"] / 100
        denom = dp + inputs["closingCostPct"]
        price_from_cash = inputs["savings"] / denom if denom > 0 else math.inf
    else:
        price_from_cash = (
            (inputs["savings"] - dp_in["amount"]) / inputs["closingCostPct"]
            if inputs["closingCostPct"] > 0
            else math.inf
        )

    raw_max = min(price_from_dti, price_from_cash)
    if not math.isfinite(raw_max) or raw_max < 0:
        raw_max = 0.0

    binding = "cash available" if price_from_cash < price_from_dti else binding_dti
    return {"rawMaxPrice": raw_max, "bindingConstraint": binding, "allowedHousing": allowed_housing}


def build_result(
    inputs: dict,
    program: dict,
    solved: dict,
    tier_adjustment_pct: float,
    scenario_label: str,
    caps_label: str,
) -> dict:
    max_price = math.floor(solved["rawMaxPrice"] / 1000) * 1000
    monthly_income = effective_monthly_income(inputs)
    rental_counted = rental_income_counted(inputs)
    min_down_for_units = get_min_down_pct(program, inputs["propertyType"])
    effective_rate_pct = max(0.0, inputs["annualRatePct"] + tier_adjustment_pct)

    dp_in = inputs["downPayment"]
    if dp_in["mode"] == "percent":
        down_pct = dp_in["pct"] / 100
    else:
        down_pct = min(1.0, dp_in["amount"] / max_price) if max_price > 0 else 0.0
    if dp_in["mode"] == "percent":
        down_payment_amount = max_price * down_pct
    else:
        down_payment_amount = min(dp_in["amount"], max_price)

    mi = program["mortgageInsurance"]
    upfront = mi.get("upfrontFinancedPct") or 0.0
    base_loan = max(0.0, max_price - down_payment_amount)
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

    closing_costs = round2(max_price * inputs["closingCostPct"])
    cash_to_close = round2(down_payment_amount + closing_costs)

    assumptions = [
        f"Scenario: {scenario_label} — DTI caps {caps_label}, rate {effective_rate_pct:.2f}%.",
        *dti_cap_justifications(program["id"], scenario_label),
        f"Credit tier adds +{tier_adjustment_pct:.2f}% illustrative pricing adjustment "
        "(not a multiplier, not an approval factor)."
        if tier_adjustment_pct > 0
        else f"No credit-tier adjustment applied{'' if inputs.get('creditTierId') else ' (no range selected)'}.",
        f"Property type: {property_type_label(inputs['propertyType'])}.",
        (
            f"Rental income counted: 75% × {money(inputs['monthlyRentalIncome'])}/mo = "
            f"{money(rental_counted)}/mo toward qualifying income (illustrative; lenders "
            "verify with signed leases or an appraisal)."
            if rental_counted > 0
            else None
        ),
        f"Minimum down for {program['name']} on {property_type_label(inputs['propertyType'])}: {min_down_for_units * 100:.1f}% (illustrative).",
        (
            f"Mortgage insurance ({program['name']}): {mi['description']}"
            if mi_applies
            else f"No monthly mortgage insurance ({program['name']})."
        ),
        f"{upfront * 100:.2f}% one-time fee financed into the loan." if upfront > 0 else None,
        f"Closing costs estimated at {inputs['closingCostPct'] * 100:.1f}% of price (NYC-typical default 3%).",
        f"Loan program rules: {program['source']} (effective {program['effectiveDate']}). {program['note']}",
        "Max price floored to the nearest $1,000. Figures are estimates, not a loan approval.",
    ]
    assumptions = [s for s in assumptions if s]

    return {
        "maxPrice": max_price,
        "downPaymentAmount": round2(down_payment_amount),
        "mortgageAmount": round2(mortgage_amount),
        "monthly": monthly,
        "closingCosts": closing_costs,
        "cashToClose": cash_to_close,
        "frontEndDTI": monthly["total"] / monthly_income if monthly_income > 0 else 0.0,
        "backEndDTI": (monthly["total"] + inputs["monthlyDebts"]) / monthly_income if monthly_income > 0 else 0.0,
        "allowedHousing": round2(solved["allowedHousing"]),
        "bindingConstraint": solved["bindingConstraint"],
        "effectiveRatePct": effective_rate_pct,
        "effectiveMonthlyIncome": round2(monthly_income),
        "rentalIncomeCounted": round2(rental_counted),
        "assumptions": assumptions,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _caps_label(params: dict) -> str:
    f = int(math.floor(params["frontDTI"] * 100 + 0.5))
    b = int(math.floor(params["backDTI"] * 100 + 0.5))
    return f"{f}/{b}"


def qualify_buyer(inputs: dict) -> dict:
    """Validate, then solve the conservative and higher scenarios."""
    validation = validate_inputs(inputs)
    if not validation["ok"]:
        return validation

    program = LOAN_PROGRAMS[inputs["loanProgramId"]]
    tier = get_credit_tier(inputs.get("creditTierId"))
    tier_adj = tier["rateAdjustmentPct"] if tier else 0.0

    conservative_params = {
        "frontDTI": program["conservativeDtiCaps"]["front"],
        "backDTI": program["conservativeDtiCaps"]["back"],
    }
    higher_params = {
        "frontDTI": program["dtiCaps"]["front"],
        "backDTI": program["dtiCaps"]["back"],
    }

    conservative = build_result(
        inputs, program, solve_max_price(inputs, program, conservative_params, tier_adj),
        tier_adj, "conservative", _caps_label(conservative_params),
    )
    higher = build_result(
        inputs, program, solve_max_price(inputs, program, higher_params, tier_adj),
        tier_adj, "higher", _caps_label(higher_params),
    )

    # Amount-mode down payments can't be checked against the program minimum
    # until we know the price — check it here against the solved result,
    # using the unit-count-adjusted minimum.
    if inputs["downPayment"]["mode"] == "amount" and higher["maxPrice"] > 0:
        effective_pct = higher["downPaymentAmount"] / higher["maxPrice"]
        min_down = get_min_down_pct(program, inputs["propertyType"])
        if effective_pct < min_down - 1e-9:
            if inputs["propertyType"] == "single":
                msg = (
                    f"This down payment is below the {program['name']} minimum of "
                    f"{min_down * 100:.1f}% at the estimated price. Increase the down "
                    "payment or savings."
                )
            else:
                msg = (
                    f"This down payment is below the {program['name']} minimum of "
                    f"{min_down * 100:.1f}% for {property_type_label(inputs['propertyType'])} "
                    "properties at the estimated price (illustrative). Increase the down "
                    "payment or savings."
                )
            return {"ok": False, "issues": [_issue("downPayment", "BELOW_PROGRAM_MINIMUM", msg)]}

    return {"ok": True, "value": {"conservative": conservative, "higher": higher, "program": program}}


def sensitivity(inputs: dict) -> dict:
    """What-if analysis: re-solve the higher scenario varying one factor at a time."""
    base = qualify_buyer(inputs)
    if not base["ok"]:
        return base
    baseline = base["value"]["higher"]["maxPrice"]

    dp_in = inputs["downPayment"]
    base_down_pct = dp_in["pct"] if dp_in["mode"] == "percent" else (dp_in["amount"] / baseline * 100 if baseline > 0 else 0.0)
    pct_inputs = {**inputs, "downPayment": {"mode": "percent", "pct": base_down_pct}}

    def _clone():
        c = dict(pct_inputs)
        c["downPayment"] = dict(pct_inputs["downPayment"])
        return c

    variants = [
        ("Interest rate", "+1%", lambda i: i.update(annualRatePct=min(25, i["annualRatePct"] + 1))),
        ("Interest rate", "−1%", lambda i: i.update(annualRatePct=max(0, i["annualRatePct"] - 1))),
        ("Down payment", "+5 pts", lambda i: i.update(downPayment={"mode": "percent", "pct": min(100, i["downPayment"]["pct"] + 5)})),
        ("Down payment", "−5 pts", lambda i: i.update(downPayment={"mode": "percent", "pct": max(0, i["downPayment"]["pct"] - 5)})),
        ("Monthly debts", "+$500", lambda i: i.update(monthlyDebts=i["monthlyDebts"] + 500)),
        ("Monthly debts", "−$500", lambda i: i.update(monthlyDebts=max(0, i["monthlyDebts"] - 500))),
        ("Savings", "+$25k", lambda i: i.update(savings=i["savings"] + 25000)),
        ("Savings", "−$25k", lambda i: i.update(savings=max(0, i["savings"] - 25000))),
    ]

    rows = []
    for label, change, mutate in variants:
        copy = _clone()
        mutate(copy)
        out = qualify_buyer(copy)
        if not out["ok"]:
            continue
        new_max = out["value"]["higher"]["maxPrice"]
        rows.append({"label": label, "change": change, "newMaxPrice": new_max, "delta": new_max - baseline})

    return {"ok": True, "baselineMaxPrice": baseline, "rows": rows}
