"""
Calculator REST endpoints.

POST /api/v1/qualify         — buyer qualification (conservative + higher)
POST /api/v1/monthly-cost    — true monthly cost + cash to close
POST /api/v1/seller-proceeds — seller net proceeds waterfall
GET  /api/v1/loan-programs   — program configs, credit tiers, property types

Engines return {"ok": True, "value": ...} or {"ok": False, "issues": [...]}.
Validation failures surface as HTTP 422 with the engine's issue list, so
clients get the same field/code/message shape the frontend already renders.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import buying_power, monthly_cost, seller_proceeds
from ..loan_programs import CREDIT_TIERS, LOAN_PROGRAM_LIST, PROPERTY_TYPES
from ..models import (
    BuyerQualificationInputs,
    LoanProgramsResponse,
    MonthlyCostInputs,
    MonthlyCostResult,
    QualifyResponse,
    SellerProceedsInputs,
    SellerProceedsResult,
)

router = APIRouter(prefix="/api/v1", tags=["calculators"])


def _or_422(outcome: dict):
    if not outcome["ok"]:
        raise HTTPException(status_code=422, detail=outcome["issues"])
    return outcome["value"]


@router.post("/qualify", response_model=QualifyResponse, summary="Buyer qualification estimate")
def qualify(body: BuyerQualificationInputs):
    """Max affordable price under conservative and higher DTI scenarios."""
    return _or_422(buying_power.qualify_buyer(body.model_dump()))


@router.post("/monthly-cost", response_model=MonthlyCostResult, summary="True monthly cost + cash to close")
def get_monthly_cost(body: MonthlyCostInputs):
    """Monthly P&I/tax/insurance/MI/HOA breakdown and NYC cash-to-close estimate."""
    return _or_422(monthly_cost.calculate_monthly_cost(body.model_dump()))


@router.post("/seller-proceeds", response_model=SellerProceedsResult, summary="Seller net proceeds")
def get_seller_proceeds(body: SellerProceedsInputs):
    """Itemized deduction waterfall → estimated net proceeds."""
    return _or_422(seller_proceeds.estimate_proceeds(body.model_dump()))


@router.get("/loan-programs", response_model=LoanProgramsResponse, summary="Loan program reference data")
def get_loan_programs():
    """Program configs (DTI caps, MI rules, sources), credit tiers, property types."""
    return {"programs": LOAN_PROGRAM_LIST, "creditTiers": CREDIT_TIERS, "propertyTypes": PROPERTY_TYPES}
