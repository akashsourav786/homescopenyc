"""
Seller Net Proceeds Calculator — pure calculation engine.

Faithful Python port of `lib/calculators/seller-proceeds.ts` (Stage 5).

Net proceeds = sale price − Σ deductions:
  1. Mortgage payoff(s) — first + optional second/HELOC, as entered.
  2. Broker commission — % of the GROSS price (6% default, negotiable).
  3. NYC transfer tax (RPTT), residential: 1% ≤ $500k, 1.425% of the FULL
     price above $500k (not a marginal bracket).
  4. NYS transfer tax: 0.4% when consideration exceeds $500.
  5. Seller concessions, attorney fee, other seller costs — as entered.

All amounts are whole dollars. Net proceeds CAN be negative (seller brings
cash to closing).

Deliberate omissions (documented): capital-gains tax (situational), NYS
additional/supplemental taxes at $3M+ (not modeled), co-op flip taxes and
prorations (attorney computes from the closing date).
"""

from __future__ import annotations

import math

from ._numeric import is_num, round_half_up

# ---------------------------------------------------------------------------
# Transfer-tax constants (verified Oct 2026)
# ---------------------------------------------------------------------------

NYC_RPTT_LOW_RATE = 0.01
NYC_RPTT_HIGH_RATE = 0.01425
NYC_RPTT_THRESHOLD = 500_000
NYS_TRANSFER_TAX_RATE = 0.004
NYS_TRANSFER_TAX_MIN_CONSIDERATION = 500

NYC_RPTT_SOURCE = (
    "NYC Department of Finance — Real Property Transfer Tax page (nyc.gov) "
    "and 2024 RPTT report tax-rate tables"
)
NYS_TRANSFER_TAX_SOURCE = (
    "NYC Department of Finance — 2024 RPTT report tax-rate tables (NYS Levy 0.4%)"
)

DEFAULT_COMMISSION_PCT = 6
DEFAULT_ATTORNEY_FEE = 2500


def nyc_transfer_tax(sale_price: float) -> int:
    """NYC transfer tax (RPTT): 1% at $500k or less, 1.425% of the FULL
    price above $500k. Rounded to the dollar."""
    if not is_num(sale_price) or sale_price <= 0:
        return 0
    rate = NYC_RPTT_LOW_RATE if sale_price <= NYC_RPTT_THRESHOLD else NYC_RPTT_HIGH_RATE
    return round_half_up(sale_price * rate)


def nys_transfer_tax(sale_price: float) -> int:
    """NYS transfer tax: 0.4% when consideration exceeds $500. Whole dollars."""
    if not is_num(sale_price) or sale_price <= NYS_TRANSFER_TAX_MIN_CONSIDERATION:
        return 0
    return round_half_up(sale_price * NYS_TRANSFER_TAX_RATE)


# ---------------------------------------------------------------------------
# Validation (mirrors validateInputs — same fields, codes, messages)
# ---------------------------------------------------------------------------

def _issue(field: str, code: str, message: str) -> dict:
    return {"field": field, "code": code, "message": message}


def validate_inputs(inputs: dict) -> dict:
    issues: list[dict] = []

    if not is_num(inputs.get("salePrice")) or inputs["salePrice"] <= 0:
        issues.append(_issue("salePrice", "INVALID_SALE_PRICE", "Sale price must be greater than $0."))
    if not is_num(inputs.get("firstMortgageBalance")) or inputs["firstMortgageBalance"] < 0:
        issues.append(_issue(
            "firstMortgageBalance", "INVALID_MORTGAGE_BALANCE",
            "First mortgage balance can't be negative — enter 0 if you own the home free and clear.",
        ))
    if not is_num(inputs.get("secondMortgageBalance")) or inputs["secondMortgageBalance"] < 0:
        issues.append(_issue(
            "secondMortgageBalance", "INVALID_MORTGAGE_BALANCE",
            "Second mortgage / HELOC balance can't be negative — enter 0 if you don't have one.",
        ))
    if not is_num(inputs.get("commissionPct")) or not (0 <= inputs["commissionPct"] <= 100):
        issues.append(_issue(
            "commissionPct", "INVALID_COMMISSION",
            "Commission must be between 0% and 100%. It is negotiable — enter whatever you and your agent agree on.",
        ))
    for field, label in (
        ("sellerConcessions", "Seller concessions"),
        ("attorneyFee", "Attorney fee"),
        ("otherSellerCosts", "Other seller costs"),
    ):
        v = inputs.get(field)
        if not is_num(v) or v < 0:
            issues.append(_issue(field, "INVALID_AMOUNT", f"{label} can't be negative — enter 0 if there are none."))

    return {"ok": True} if not issues else {"ok": False, "issues": issues}


# ---------------------------------------------------------------------------
# Estimate
# ---------------------------------------------------------------------------

def _fmt_pct(pct: float) -> str:
    """Trim trailing zeros: 6 → "6", 5.25 → "5.25"."""
    return f"{pct:.2f}".rstrip("0").rstrip(".")


def estimate_proceeds(inputs: dict) -> dict:
    validation = validate_inputs(inputs)
    if not validation["ok"]:
        return validation

    price = round_half_up(inputs["salePrice"])
    first = round_half_up(inputs["firstMortgageBalance"])
    second = round_half_up(inputs["secondMortgageBalance"])

    lines: list[dict] = []

    if first > 0:
        lines.append({
            "label": "First mortgage payoff",
            "amount": first,
            "note": "Your lender's official payoff figure may include accrued interest and fees — check your payoff statement.",
        })
    if second > 0:
        lines.append({
            "label": "Second mortgage / HELOC payoff",
            "amount": second,
            "note": None,
        })

    commission = round_half_up(price * (inputs["commissionPct"] / 100))
    lines.append({
        "label": f"Broker commission ({_fmt_pct(inputs['commissionPct'])}%)",
        "amount": commission,
        "note": "Negotiable — the 6% default is illustrative only.",
    })

    rptt_rate = NYC_RPTT_LOW_RATE if price <= NYC_RPTT_THRESHOLD else NYC_RPTT_HIGH_RATE
    lines.append({
        "label": "NYC transfer tax (RPTT)",
        "amount": nyc_transfer_tax(price),
        "note": (
            "1% of the sale price — price is $500,000 or less (NYC RPTT residential rate)."
            if price <= NYC_RPTT_THRESHOLD
            else "1.425% of the full sale price — price is over $500,000 (NYC RPTT residential rate)."
        ),
    })
    lines.append({
        "label": "NYS transfer tax",
        "amount": nys_transfer_tax(price),
        "note": "0.4% ($4 per $1,000) of the sale price — paid by the seller (grantor).",
    })

    concessions = round_half_up(inputs["sellerConcessions"])
    if concessions > 0:
        lines.append({
            "label": "Seller concessions",
            "amount": concessions,
            "note": "Credits to the buyer agreed in your contract — for example, repair credits or closing-cost help.",
        })
    attorney = round_half_up(inputs["attorneyFee"])
    if attorney > 0:
        lines.append({"label": "Attorney fee", "amount": attorney, "note": None})
    other = round_half_up(inputs["otherSellerCosts"])
    if other > 0:
        lines.append({
            "label": "Other seller costs",
            "amount": other,
            "note": "For example, a co-op flip tax or building move-out / transfer fees.",
        })

    total_deductions = sum(l["amount"] for l in lines)
    net_proceeds = price - total_deductions
    equity_before_costs = price - first - second

    rptt_rate_pct = f"{rptt_rate * 100:.3f}".rstrip("0").rstrip(".") + "%"
    assumptions = [
        f"NYC transfer tax (RPTT): 1% of the price at $500,000 or less, 1.425% of the full price above $500,000 — residential: 1–3 family houses, individual condos, and co-ops. This estimate uses {rptt_rate_pct}. Source: {NYC_RPTT_SOURCE}. Rates verified October 2026.",
        f"NYS transfer tax: 0.4% of the price ($4 per $1,000) when the consideration exceeds $500, paid by the seller. Source: {NYS_TRANSFER_TAX_SOURCE}. Rate verified October 2026.",
        "The additional NYS transfer taxes for NYC residential sales of $3M or more (0.25% additional base tax plus 0.25%–2.9% supplemental tax) are NOT included — this estimate understates taxes above that threshold.",
        "Broker commission is a percentage of the gross sale price, not of equity. The 6% default is illustrative — commission is negotiable between you and your agent.",
        (
            "No mortgage payoff included — you entered $0 balances (free and clear)."
            if first == 0 and second == 0
            else "Mortgage payoffs use the balances you entered; your lender's official payoff statement may include accrued interest and fees."
        ),
        "Capital-gains tax is EXCLUDED from this estimate: it depends on your holding period, cost basis, and whether the primary-residence exclusion applies. A CPA can estimate it.",
        "Figures are estimates, not professional advice. Consult a real-estate attorney and/or CPA before listing or selling.",
    ]

    return {
        "ok": True,
        "value": {
            "salePrice": price,
            "deductions": lines,
            "totalDeductions": total_deductions,
            "netProceeds": net_proceeds,
            "equityBeforeCosts": equity_before_costs,
            "assumptions": assumptions,
        },
    }
