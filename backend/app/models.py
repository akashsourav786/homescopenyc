"""
Pydantic v2 request/response models for the HomeScope NYC API.

Field names mirror the TypeScript interfaces in `lib/calculators/` exactly
(camelCase), so the API shape matches the frontend's existing types and a
future frontend wiring is a mechanical mapping. Engines work on plain
dicts; these models are the HTTP boundary only.
"""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

PropertyType = Literal["single", "two-unit", "three-four-unit"]
LoanProgramId = Literal["conventional", "fha", "va"]
BindingConstraint = Literal["front-end DTI", "back-end DTI", "cash available"]


class DownPaymentPercent(BaseModel):
    mode: Literal["percent"]
    pct: float = Field(description="Down payment in percent, e.g. 10 = 10%")


class DownPaymentAmount(BaseModel):
    mode: Literal["amount"]
    amount: float = Field(description="Down payment in dollars")


DownPaymentInput = Union[DownPaymentPercent, DownPaymentAmount]


class ValidationIssue(BaseModel):
    field: str
    code: str
    message: str


class ErrorResponse(BaseModel):
    detail: list[ValidationIssue]


# ---------------------------------------------------------------------------
# Loan programs
# ---------------------------------------------------------------------------

class DtiCaps(BaseModel):
    front: float
    back: float


class MortgageInsuranceRule(BaseModel):
    kind: Literal["pmi", "fha-mip", "none"]
    threshold: Optional[float] = None
    annualRate: Optional[float] = None
    upfrontFinancedPct: Optional[float] = None
    description: str


class LoanProgram(BaseModel):
    id: str
    name: str
    shortName: str
    minDownPct: float
    minDownPctByUnits: dict[str, float]
    dtiCaps: DtiCaps
    conservativeDtiCaps: DtiCaps
    mortgageInsurance: MortgageInsuranceRule
    source: str
    effectiveDate: str
    note: str


class CreditTier(BaseModel):
    id: str
    label: str
    rateAdjustmentPct: float
    note: str


class LoanProgramsResponse(BaseModel):
    programs: list[LoanProgram]
    creditTiers: list[CreditTier]
    propertyTypes: list[dict[str, str]]


# ---------------------------------------------------------------------------
# Buyer qualification (/api/v1/qualify)
# ---------------------------------------------------------------------------

class BuyerQualificationInputs(BaseModel):
    annualIncome: float
    monthlyDebts: float
    savings: float
    downPayment: DownPaymentInput
    creditTierId: Optional[str] = None
    loanProgramId: str
    annualRatePct: float
    loanTermYears: int
    annualPropertyTax: float
    annualInsurance: float
    monthlyHOA: float
    closingCostPct: float = 0.03
    propertyType: str = "single"
    monthlyRentalIncome: float = 0.0


class MonthlyBreakdown(BaseModel):
    principalAndInterest: float
    propertyTax: float
    insurance: float
    hoa: float
    mortgageInsurance: float
    total: float


class QualificationResult(BaseModel):
    maxPrice: int
    downPaymentAmount: float
    mortgageAmount: float
    monthly: MonthlyBreakdown
    closingCosts: float
    cashToClose: float
    frontEndDTI: float
    backEndDTI: float
    allowedHousing: float
    bindingConstraint: BindingConstraint
    effectiveRatePct: float
    effectiveMonthlyIncome: float
    rentalIncomeCounted: float
    assumptions: list[str]


class QualifyResponse(BaseModel):
    conservative: QualificationResult
    higher: QualificationResult
    program: LoanProgram


# ---------------------------------------------------------------------------
# Monthly cost (/api/v1/monthly-cost)
# ---------------------------------------------------------------------------

class MonthlyCostInputs(BaseModel):
    purchasePrice: float
    downPayment: DownPaymentInput
    annualRatePct: float
    loanTermYears: int
    annualPropertyTax: float
    annualInsurance: float
    monthlyHOA: float
    loanProgramId: str
    creditTierId: Optional[str] = None


class ClosingCostLine(BaseModel):
    label: str
    amount: float
    source: str
    illustrative: bool


class MonthlyCostResult(BaseModel):
    purchasePrice: float
    downPaymentAmount: float
    downPct: float
    mortgageAmount: float
    effectiveRatePct: float
    monthly: MonthlyBreakdown
    closingCosts: list[ClosingCostLine]
    closingCostsTotal: float
    cashToClose: float
    mansionTaxRate: Optional[float] = None
    assumptions: list[str]


# ---------------------------------------------------------------------------
# Seller proceeds (/api/v1/seller-proceeds)
# ---------------------------------------------------------------------------

class SellerProceedsInputs(BaseModel):
    salePrice: float
    firstMortgageBalance: float = 0.0
    secondMortgageBalance: float = 0.0
    commissionPct: float = 6.0
    sellerConcessions: float = 0.0
    attorneyFee: float = 2500.0
    otherSellerCosts: float = 0.0


class DeductionLine(BaseModel):
    label: str
    amount: int
    note: Optional[str] = None


class SellerProceedsResult(BaseModel):
    salePrice: int
    deductions: list[DeductionLine]
    totalDeductions: int
    netProceeds: int
    equityBeforeCosts: int
    assumptions: list[str]
