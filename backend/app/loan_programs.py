"""
Loan-program rules for the HomeScope NYC calculators.

Faithful Python port of `lib/calculators/loan-programs.ts` (Stage 3).
Every program carries `source` + `effectiveDate` metadata so clients can
show where the numbers came from and how fresh they are. All caps, fees,
and insurance figures here are ILLUSTRATIVE — they approximate typical
program guidelines but are not lender quotes, and real qualification is
always set by the lender/underwriter.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROPERTY_TYPES = [
    {"id": "single", "label": "Single-family"},
    {"id": "two-unit", "label": "2-unit"},
    {"id": "three-four-unit", "label": "3–4 units"},
]

PROPERTY_TYPE_IDS = {p["id"] for p in PROPERTY_TYPES}


def property_type_label(t: str) -> str:
    for p in PROPERTY_TYPES:
        if p["id"] == t:
            return p["label"]
    return t


# Illustrative haircut applied to user-entered rental income before it counts
# toward qualifying income (vacancy/maintenance allowance).
# Source: Fannie Mae rental-income guidelines use 75% of gross rents —
# labeled illustrative; lenders verify with signed leases or an appraisal.
RENTAL_INCOME_HAIRCUT = 0.75

# ---------------------------------------------------------------------------
# Loan programs (mirrors LOAN_PROGRAMS in loan-programs.ts)
# ---------------------------------------------------------------------------

LOAN_PROGRAMS: dict[str, dict] = {
    "conventional": {
        "id": "conventional",
        "name": "Conventional",
        "shortName": "Conv.",
        "minDownPct": 0.03,
        "minDownPctByUnits": {
            "single": 0.03,
            "two-unit": 0.15,
            "three-four-unit": 0.25,
        },
        "dtiCaps": {"front": 0.45, "back": 0.5},
        "conservativeDtiCaps": {"front": 0.33, "back": 0.43},
        "mortgageInsurance": {
            "kind": "pmi",
            "threshold": 0.2,
            "annualRate": 0.005,
            "description": (
                "Illustrative private mortgage insurance (PMI) of 0.50%/yr of the "
                "loan amount, applied while the down payment is below 20% and "
                "removed at 80% loan-to-value. Actual PMI varies by lender, "
                "credit, and loan terms."
            ),
        },
        "source": "Fannie Mae Selling Guide — Desktop Underwriter (DU) maximums, illustrative",
        "effectiveDate": "2026-10",
        "note": (
            "Caps reflect DU automated-underwriting maximums (up to 50% DTI with "
            "strong compensating factors such as excellent credit and reserves). "
            "Many lenders apply stricter overlays, often 45%. Conservative scenario "
            "(33/43): 43% back-end reflects the long-standing QM threshold retained "
            "as a common lender overlay; 33% front-end is a comfortable housing ratio. "
            "Unit-count minimum down payments follow conforming LTV limits "
            "(illustrative). Real qualification is set by the lender/underwriter."
        ),
    },
    "fha": {
        "id": "fha",
        "name": "FHA",
        "shortName": "FHA",
        "minDownPct": 0.035,
        "minDownPctByUnits": {
            "single": 0.035,
            "two-unit": 0.035,
            "three-four-unit": 0.035,
        },
        "dtiCaps": {"front": 0.47, "back": 0.57},
        "conservativeDtiCaps": {"front": 0.31, "back": 0.43},
        "mortgageInsurance": {
            "kind": "fha-mip",
            "annualRate": 0.0055,
            "upfrontFinancedPct": 0.0175,
            "description": (
                "Illustrative FHA mortgage insurance: 1.75% upfront MIP financed "
                "into the loan plus 0.55%/yr annual MIP on the loan amount. FHA MIP "
                "rules (including when it can drop) depend on the loan's down "
                "payment and term."
            ),
        },
        "source": "FHA Single Family Housing Policy Handbook 4000.1 + TOTAL Mortgage Scorecard maximums — illustrative",
        "effectiveDate": "2026-10",
        "note": (
            "Caps reflect TOTAL Scorecard maximums (46.99%/56.99%) with AUS approval "
            "and compensating factors. Conservative scenario (31/43): FHA Handbook "
            "4000.1 standard ratios. Lenders apply overlays. FHA loans require lender "
            "approval and property eligibility — figures illustrative, verify current "
            "rules with a lender."
        ),
    },
    "va": {
        "id": "va",
        "name": "VA",
        "shortName": "VA",
        "minDownPct": 0.0,
        "minDownPctByUnits": {"single": 0.0, "two-unit": 0.0, "three-four-unit": 0.0},
        # VA has no hard DTI maximum — 41% is the traditional guideline. The
        # "higher" caps reflect AUS approvals with strong residual income; the
        # residual-income test itself is not modeled (see note).
        "dtiCaps": {"front": 0.45, "back": 0.5},
        "conservativeDtiCaps": {"front": 0.41, "back": 0.41},
        "mortgageInsurance": {
            "kind": "none",
            "upfrontFinancedPct": 0.0215,
            "description": (
                "No monthly mortgage insurance. Illustrative VA funding fee of "
                "2.15% (first-use, no down payment) financed into the loan. Actual "
                "fee depends on service history, down payment, and prior VA loan "
                "use; some borrowers are exempt."
            ),
        },
        "source": "VA Lenders Handbook — illustrative",
        "effectiveDate": "2026-10",
        "note": (
            "VA has no hard DTI maximum; 41% is the traditional guideline and higher "
            "ratios are approved with strong residual income. Conservative scenario "
            "(41/41): the traditional VA Lenders Handbook guideline. The VA "
            "residual-income test itself is not modeled here. For eligible veterans, "
            "service members, and qualifying spouses only."
        ),
    },
}

LOAN_PROGRAM_LIST: list[dict] = [
    LOAN_PROGRAMS["conventional"],
    LOAN_PROGRAMS["fha"],
    LOAN_PROGRAMS["va"],
]


def get_program(program_id: str) -> dict | None:
    return LOAN_PROGRAMS.get(program_id)


def get_min_down_pct(program: dict, property_type: str) -> float:
    """Minimum down payment for a program + property type, as a fraction."""
    return program["minDownPctByUnits"].get(property_type, program["minDownPct"])


def dti_cap_justifications(program_id: str, scenario: str) -> list[str]:
    """Sourced justification lines for a program's DTI caps, per scenario."""
    manual_ref = (
        "Manual-underwriting reference: 36% base, up to 45% with compensating "
        "factors such as credit score and reserves (Fannie Mae B3-6-02)."
    )
    if program_id == "conventional":
        if scenario == "higher":
            return [
                "DTI caps 45/50 (higher) — Fannie Mae Selling Guide B3-6-02: maximum allowable DTI for Desktop Underwriter Approve/Eligible.",
                manual_ref,
            ]
        return [
            "DTI caps 33/43 (conservative) — former QM 43% threshold (CFPB General QM Rule; replaced by the APOR price test July 2021), retained as a common lender overlay; 33% front-end is a comfortable housing ratio.",
            manual_ref,
        ]
    if program_id == "fha":
        if scenario == "higher":
            return [
                "DTI caps 47/57 (higher) — FHA Single Family Housing Policy Handbook 4000.1: TOTAL Mortgage Scorecard maximums (46.99%/56.99%) with AUS approval.",
            ]
        return [
            "DTI caps 31/43 (conservative) — FHA Handbook 4000.1 standard ratios.",
        ]
    if program_id == "va":
        if scenario == "higher":
            return [
                "DTI caps 45/50 (higher) — VA Lenders Handbook: VA sets no hard DTI maximum; higher ratios are approved with strong residual income. The residual-income test itself is not modeled.",
            ]
        return [
            "DTI caps 41/41 (conservative) — VA Lenders Handbook traditional 41% guideline.",
        ]
    return []


# ---------------------------------------------------------------------------
# Credit tiers — IMPORTANT DESIGN RULE (mirrors the TS side): a credit tier
# NEVER multiplies buying power and NEVER gates approval. It only selects an
# illustrative interest-rate pricing adjustment shown transparently.
# ---------------------------------------------------------------------------

CREDIT_TIERS: list[dict] = [
    {
        "id": "excellent",
        "label": "760+",
        "rateAdjustmentPct": 0.0,
        "note": "Best illustrative pricing tier — no adjustment.",
    },
    {
        "id": "good",
        "label": "700–759",
        "rateAdjustmentPct": 0.25,
        "note": "+0.25% illustrative pricing adjustment.",
    },
    {
        "id": "fair",
        "label": "640–699",
        "rateAdjustmentPct": 0.5,
        "note": "+0.50% illustrative pricing adjustment.",
    },
    {
        "id": "low",
        "label": "Below 640",
        "rateAdjustmentPct": 0.75,
        "note": "+0.75% illustrative pricing adjustment. Many loan programs have minimum score requirements — ask a lender.",
    },
]


def get_credit_tier(tier_id: str | None) -> dict | None:
    if not tier_id:
        return None
    for t in CREDIT_TIERS:
        if t["id"] == tier_id:
            return t
    return None
