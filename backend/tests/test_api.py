"""
API endpoint tests — FastAPI routes via httpx TestClient.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def qualify_body(**overrides):
    body = {
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
    body.update(overrides)
    return body


def monthly_body(**overrides):
    body = {
        "purchasePrice": 1200000,
        "downPayment": {"mode": "percent", "pct": 10},
        "annualRatePct": 6.5,
        "loanTermYears": 30,
        "annualPropertyTax": 12000,
        "annualInsurance": 2400,
        "monthlyHOA": 0,
        "loanProgramId": "conventional",
    }
    body.update(overrides)
    return body


def seller_body(**overrides):
    body = {
        "salePrice": 1000000,
        "firstMortgageBalance": 400000,
        "secondMortgageBalance": 0,
        "commissionPct": 6,
        "sellerConcessions": 0,
        "attorneyFee": 2500,
        "otherSellerCosts": 0,
    }
    body.update(overrides)
    return body


class TestMeta:
    def test_health(self):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_root(self):
        r = client.get("/")
        assert r.status_code == 200
        assert r.json()["service"] == "homescope-nyc-api"

    def test_openapi_renders(self):
        r = client.get("/openapi.json")
        assert r.status_code == 200
        paths = r.json()["paths"]
        assert "/api/v1/qualify" in paths
        assert "/api/v1/monthly-cost" in paths
        assert "/api/v1/seller-proceeds" in paths
        assert "/api/v1/loan-programs" in paths


class TestQualifyEndpoint:
    def test_valid_returns_both_scenarios(self):
        r = client.post("/api/v1/qualify", json=qualify_body())
        assert r.status_code == 200
        data = r.json()
        assert data["conservative"]["maxPrice"] == 474000
        assert data["higher"]["maxPrice"] == 688000
        assert data["program"]["id"] == "conventional"

    def test_invalid_returns_422_with_issue_codes(self):
        r = client.post("/api/v1/qualify", json=qualify_body(annualIncome=0))
        assert r.status_code == 422
        codes = [i["code"] for i in r.json()["detail"]]
        assert "INVALID_INCOME" in codes

    def test_amount_mode_down_payment(self):
        r = client.post(
            "/api/v1/qualify",
            json=qualify_body(downPayment={"mode": "amount", "amount": 60000}),
        )
        assert r.status_code == 200
        assert r.json()["higher"]["downPaymentAmount"] == 60000


class TestMonthlyCostEndpoint:
    def test_valid_fixture(self):
        r = client.post("/api/v1/monthly-cost", json=monthly_body())
        assert r.status_code == 200
        data = r.json()
        assert data["closingCostsTotal"] == 42000.0
        assert data["cashToClose"] == 162000.0
        assert data["mansionTaxRate"] == 0.01

    def test_invalid_price_422(self):
        r = client.post("/api/v1/monthly-cost", json=monthly_body(purchasePrice=-5))
        assert r.status_code == 422
        assert any(i["code"] == "INVALID_PRICE" for i in r.json()["detail"])


class TestSellerProceedsEndpoint:
    def test_valid_fixture(self):
        r = client.post("/api/v1/seller-proceeds", json=seller_body())
        assert r.status_code == 200
        data = r.json()
        assert data["netProceeds"] == 519250
        assert data["totalDeductions"] == 480750

    def test_underwater_negative(self):
        r = client.post(
            "/api/v1/seller-proceeds",
            json=seller_body(salePrice=500000, firstMortgageBalance=480000),
        )
        assert r.status_code == 200
        assert r.json()["netProceeds"] < 0

    def test_invalid_commission_422(self):
        r = client.post("/api/v1/seller-proceeds", json=seller_body(commissionPct=150))
        assert r.status_code == 422
        assert any(i["code"] == "INVALID_COMMISSION" for i in r.json()["detail"])


class TestLoanProgramsEndpoint:
    def test_programs_list(self):
        r = client.get("/api/v1/loan-programs")
        assert r.status_code == 200
        data = r.json()
        ids = [p["id"] for p in data["programs"]]
        assert ids == ["conventional", "fha", "va"]
        conv = data["programs"][0]
        assert conv["conservativeDtiCaps"] == {"front": 0.33, "back": 0.43}
        assert len(data["creditTiers"]) == 4
        assert len(data["propertyTypes"]) == 3


class TestCors:
    def test_vercel_origin_allowed(self):
        r = client.options(
            "/api/v1/qualify",
            headers={
                "Origin": "https://homescopenyc.vercel.app",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == "https://homescopenyc.vercel.app"
