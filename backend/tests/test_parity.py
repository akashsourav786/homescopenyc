"""
Engine parity tests — the Python ports must reproduce the TypeScript
engines' outputs exactly on pinned fixtures.

Fixtures mirror the Vitest suites in lib/calculators/*.test.ts.
"""

import math

import pytest

from app._numeric import money, round2, round_half_up
from app.buying_power import (
    DEFAULT_CLOSING_COST_PCT,
    effective_monthly_income,
    monthly_payment,
    qualify_buyer,
    rental_income_counted,
    sensitivity,
)
from app.loan_programs import (
    CREDIT_TIERS,
    LOAN_PROGRAMS,
    RENTAL_INCOME_HAIRCUT,
    dti_cap_justifications,
    get_credit_tier,
    get_min_down_pct,
)
from app.monthly_cost import (
    MISC_CLOSING_TARGET_PCT,
    calculate_monthly_cost,
    mansion_tax,
    mansion_tax_rate,
    recording_tax,
)
from app.seller_proceeds import (
    estimate_proceeds,
    nyc_transfer_tax,
    nys_transfer_tax,
)


def client_inputs(**overrides):
    base = {
        "annualIncome": 130000,
        "monthlyDebts": 0,
        "savings": 100000,
        "downPayment": {"mode": "percent", "pct": 10},
        "loanProgramId": "conventional",
        "annualRatePct": 6.5,
        "loanTermYears": 30,
        "annualPropertyTax": 6000,
        "annualInsurance": 2400,
        "monthlyHOA": 0,
        "closingCostPct": 0.03,
        "propertyType": "single",
        "monthlyRentalIncome": 0,
    }
    base.update(overrides)
    return base


def monthly_inputs(**overrides):
    base = {
        "purchasePrice": 1200000,
        "downPayment": {"mode": "percent", "pct": 10},
        "annualRatePct": 6.5,
        "loanTermYears": 30,
        "annualPropertyTax": 12000,
        "annualInsurance": 2400,
        "monthlyHOA": 0,
        "loanProgramId": "conventional",
    }
    base.update(overrides)
    return base


def seller_inputs(**overrides):
    base = {
        "salePrice": 1000000,
        "firstMortgageBalance": 400000,
        "secondMortgageBalance": 0,
        "commissionPct": 6,
        "sellerConcessions": 0,
        "attorneyFee": 2500,
        "otherSellerCosts": 0,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Numeric helpers (JS Math semantics)
# ---------------------------------------------------------------------------

class TestNumeric:
    def test_round2_is_half_up_not_bankers(self):
        # Python's builtin round(2.675, 2) == 2.67 (banker's); JS gives 2.68.
        assert round(2.675, 2) == 2.67
        assert round2(2.675) == 2.68

    def test_round_half_up(self):
        assert round_half_up(2.5) == 3
        assert round_half_up(2.49) == 2

    def test_money_formats_like_tostring(self):
        assert money(2000) == "$2,000"
        assert money(1500) == "$1,500"


# ---------------------------------------------------------------------------
# Buyer qualification — client fixture parity
# ---------------------------------------------------------------------------

class TestQualifyParity:
    def test_client_fixture_conservative_and_higher(self):
        out = qualify_buyer(client_inputs())
        assert out["ok"] is True
        v = out["value"]
        assert v["conservative"]["maxPrice"] == 474000
        assert v["higher"]["maxPrice"] == 688000

    def test_client_fixture_binds_front_end_dti(self):
        out = qualify_buyer(client_inputs())
        v = out["value"]
        assert v["conservative"]["bindingConstraint"] == "front-end DTI"
        assert v["higher"]["bindingConstraint"] == "front-end DTI"

    def test_client_fixture_effective_rate_has_no_cushion(self):
        # The +0.5% conservative rate cushion was removed: both scenarios
        # price the identical loan.
        out = qualify_buyer(client_inputs())
        v = out["value"]
        assert v["conservative"]["effectiveRatePct"] == 6.5
        assert v["higher"]["effectiveRatePct"] == 6.5

    def test_savings_increase_does_not_move_dti_bound_price(self):
        base = qualify_buyer(client_inputs())["value"]["higher"]["maxPrice"]
        richer = qualify_buyer(client_inputs(savings=200000))["value"]["higher"]["maxPrice"]
        assert base == richer == 688000

    def test_cash_bound_fixture(self):
        out = qualify_buyer(client_inputs(annualIncome=300000, savings=50000))
        assert out["ok"] is True
        assert out["value"]["higher"]["bindingConstraint"] == "cash available"

    def test_monthly_payment_known_value(self):
        # $100k @ 6.5% / 30yr — standard amortization check.
        assert round2(monthly_payment(100000, 6.5, 30)) == 632.07

    def test_zero_rate_is_principal_over_months(self):
        assert monthly_payment(480000, 0, 30) == pytest.approx(480000 / 360)

    def test_credit_tier_is_exactly_a_rate_change_never_a_multiplier(self):
        # The tier only selects an illustrative rate adjustment: pricing with
        # tier "low" (+0.75%) must equal pricing with the base rate raised by
        # 0.75% and no tier — i.e. it never scales the price directly.
        base = qualify_buyer(client_inputs())["value"]["higher"]
        tiered = qualify_buyer(client_inputs(creditTierId="low"))["value"]["higher"]
        rate_raised = qualify_buyer(client_inputs(annualRatePct=7.25))["value"]["higher"]
        assert tiered["effectiveRatePct"] == 7.25
        assert tiered["maxPrice"] == rate_raised["maxPrice"]
        assert tiered["maxPrice"] < base["maxPrice"]  # higher rate → lower price

    def test_sensitivity_baseline_matches(self):
        out = sensitivity(client_inputs())
        assert out["ok"] is True
        assert out["baselineMaxPrice"] == 688000
        assert len(out["rows"]) == 8
        assert all("delta" in r for r in out["rows"])

    def test_max_price_floored_to_1000(self):
        out = qualify_buyer(client_inputs())
        for scenario in ("conservative", "higher"):
            assert out["value"][scenario]["maxPrice"] % 1000 == 0


# ---------------------------------------------------------------------------
# DTI caps / programs / multifamily
# ---------------------------------------------------------------------------

class TestPrograms:
    def test_dti_caps_per_program(self):
        assert LOAN_PROGRAMS["conventional"]["dtiCaps"] == {"front": 0.45, "back": 0.5}
        assert LOAN_PROGRAMS["conventional"]["conservativeDtiCaps"] == {"front": 0.33, "back": 0.43}
        assert LOAN_PROGRAMS["fha"]["dtiCaps"] == {"front": 0.47, "back": 0.57}
        assert LOAN_PROGRAMS["fha"]["conservativeDtiCaps"] == {"front": 0.31, "back": 0.43}
        assert LOAN_PROGRAMS["va"]["dtiCaps"] == {"front": 0.45, "back": 0.5}
        assert LOAN_PROGRAMS["va"]["conservativeDtiCaps"] == {"front": 0.41, "back": 0.41}

    def test_multifamily_min_down_payments(self):
        conv = LOAN_PROGRAMS["conventional"]
        assert get_min_down_pct(conv, "single") == 0.03
        assert get_min_down_pct(conv, "two-unit") == 0.15
        assert get_min_down_pct(conv, "three-four-unit") == 0.25
        fha = LOAN_PROGRAMS["fha"]
        assert get_min_down_pct(fha, "three-four-unit") == 0.035

    def test_rental_income_counted_at_exactly_75_percent(self):
        assert RENTAL_INCOME_HAIRCUT == 0.75
        inp = client_inputs(propertyType="two-unit", monthlyRentalIncome=2000)
        assert rental_income_counted(inp) == 1500.0
        assert rental_income_counted(client_inputs(monthlyRentalIncome=2000)) == 0.0  # single-family ignores
        assert effective_monthly_income(inp) == pytest.approx(130000 / 12 + 1500)

    def test_two_unit_below_15_down_rejected(self):
        out = qualify_buyer(client_inputs(
            propertyType="two-unit", downPayment={"mode": "percent", "pct": 10}
        ))
        assert out["ok"] is False
        assert any(i["code"] == "BELOW_PROGRAM_MINIMUM" for i in out["issues"])

    def test_dti_justifications_cite_sources(self):
        lines = dti_cap_justifications("conventional", "higher")
        assert any("B3-6-02" in l for l in lines)
        assert any("4000.1" in l for l in dti_cap_justifications("fha", "higher"))
        assert any("VA Lenders Handbook" in l for l in dti_cap_justifications("va", "conservative"))

    def test_credit_tiers_lookup(self):
        assert get_credit_tier("low")["rateAdjustmentPct"] == 0.75
        assert get_credit_tier("nope") is None
        assert len(CREDIT_TIERS) == 4


# ---------------------------------------------------------------------------
# Validation parity (same codes as the TS engine)
# ---------------------------------------------------------------------------

class TestValidation:
    def test_zero_income_rejected(self):
        out = qualify_buyer(client_inputs(annualIncome=0))
        assert out["ok"] is False
        assert out["issues"][0]["code"] == "INVALID_INCOME"

    def test_unknown_program_rejected(self):
        out = qualify_buyer(client_inputs(loanProgramId="usda"))
        assert out["ok"] is False
        assert any(i["code"] == "UNKNOWN_PROGRAM" for i in out["issues"])

    def test_non_integer_term_rejected(self):
        out = qualify_buyer(client_inputs(loanTermYears=30.5))
        assert out["ok"] is False
        assert any(i["code"] == "INVALID_TERM" for i in out["issues"])

    def test_negative_rent_rejected(self):
        out = qualify_buyer(client_inputs(propertyType="two-unit", monthlyRentalIncome=-100))
        assert out["ok"] is False
        assert any(i["code"] == "INVALID_RENTAL_INCOME" for i in out["issues"])

    def test_monthly_cost_rejects_bad_price(self):
        out = calculate_monthly_cost(monthly_inputs(purchasePrice=0))
        assert out["ok"] is False
        assert any(i["code"] == "INVALID_PRICE" for i in out["issues"])

    def test_seller_rejects_negative_balance(self):
        out = estimate_proceeds(seller_inputs(firstMortgageBalance=-1))
        assert out["ok"] is False
        assert any(i["code"] == "INVALID_MORTGAGE_BALANCE" for i in out["issues"])


# ---------------------------------------------------------------------------
# Monthly cost parity
# ---------------------------------------------------------------------------

class TestMonthlyCostParity:
    def test_recording_tax_brackets(self):
        assert recording_tax(400000) == pytest.approx(7200, abs=0.01)
        assert recording_tax(500000) == pytest.approx(9625, abs=0.01)
        assert recording_tax(600000) == pytest.approx(11550, abs=0.01)
        assert recording_tax(0) == 0

    def test_mansion_tax_tiers(self):
        assert mansion_tax_rate(999999) is None
        assert mansion_tax_rate(1000000) == 0.01
        assert mansion_tax(1000000) == 10000
        assert mansion_tax_rate(2000000) == 0.0125
        assert mansion_tax(2000000) == 25000
        assert mansion_tax_rate(30000000) == 0.039

    def test_1_2m_fixture_closing_lines(self):
        out = calculate_monthly_cost(monthly_inputs())
        assert out["ok"] is True
        r = out["value"]
        lines = {l["label"]: l["amount"] for l in r["closingCosts"]}
        assert lines["Mortgage recording tax (borrower portion)"] == pytest.approx(20790, abs=0.01)
        assert lines["Mansion tax (1.00% of full price)"] == 12000
        assert lines["Title insurance (illustrative)"] == pytest.approx(5400, abs=0.01)
        assert lines["Attorney fee (illustrative)"] == 3500
        assert lines["Lender & third-party fees (misc., illustrative)"] == pytest.approx(310, abs=0.01)
        assert r["closingCostsTotal"] == pytest.approx(42000, abs=0.01)
        assert r["cashToClose"] == pytest.approx(162000, abs=0.01)

    def test_800k_50_down_misc_line(self):
        out = calculate_monthly_cost(monthly_inputs(
            purchasePrice=800000,
            downPayment={"mode": "percent", "pct": 50},
            annualPropertyTax=8000,
            annualInsurance=1600,
        ))
        r = out["value"]
        misc = next(l for l in r["closingCosts"] if l["label"].startswith("Lender & third-party fees"))
        assert misc["amount"] == pytest.approx(13700, abs=0.01)
        assert r["closingCostsTotal"] == pytest.approx(28000, abs=0.01)

    def test_2_5m_has_no_misc_line(self):
        out = calculate_monthly_cost(monthly_inputs(purchasePrice=2500000))
        r = out["value"]
        assert not any(l["label"].startswith("Lender & third-party fees") for l in r["closingCosts"])
        assert any("no misc. lender" in s for s in r["assumptions"])

    def test_misc_benchmark_constant(self):
        assert MISC_CLOSING_TARGET_PCT == 0.035

    def test_no_mansion_tax_below_1m(self):
        out = calculate_monthly_cost(monthly_inputs(purchasePrice=650000, downPayment={"mode": "percent", "pct": 20}))
        r = out["value"]
        assert r["mansionTaxRate"] is None
        assert not any(l["label"].startswith("Mansion tax") for l in r["closingCosts"])


# ---------------------------------------------------------------------------
# Seller proceeds parity
# ---------------------------------------------------------------------------

class TestSellerProceedsParity:
    def test_pinned_fixture(self):
        out = estimate_proceeds(seller_inputs())
        assert out["ok"] is True
        r = out["value"]
        assert r["netProceeds"] == 519250
        assert [d["amount"] for d in r["deductions"]] == [400000, 60000, 14250, 4000, 2500]
        assert r["totalDeductions"] == 480750

    def test_rptt_threshold(self):
        assert nyc_transfer_tax(500000) == 5000
        assert nyc_transfer_tax(1000000) == 14250  # 1.425% of FULL price, not marginal
        assert nys_transfer_tax(1000000) == 4000
        assert nys_transfer_tax(400) == 0

    def test_underwater_goes_negative(self):
        out = estimate_proceeds(seller_inputs(salePrice=500000, firstMortgageBalance=480000))
        assert out["ok"] is True
        assert out["value"]["netProceeds"] < 0

    def test_free_and_clear(self):
        out = estimate_proceeds(seller_inputs(firstMortgageBalance=0))
        r = out["value"]
        assert r["equityBeforeCosts"] == 1000000
        assert not any("mortgage payoff" in d["label"].lower() for d in r["deductions"])

    def test_second_mortgage_line(self):
        out = estimate_proceeds(seller_inputs(secondMortgageBalance=50000))
        labels = [d["label"] for d in out["value"]["deductions"]]
        assert "Second mortgage / HELOC payoff" in labels
