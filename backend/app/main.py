"""
HomeScope NYC API — FastAPI service exposing the calculator engines.

Stateless: no database, no env vars required. The frontend keeps its own
client-side math for now; this service is the backend counterpart (and the
future single source of truth) for the same calculations.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import calculators

app = FastAPI(
    title="HomeScope NYC API",
    version="0.1.0",
    description=(
        "Buyer qualification, true monthly cost, and seller net proceeds "
        "calculators for NYC — illustrative estimates, never loan approvals."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://homescopenyc.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(calculators.router)


@app.get("/health", summary="Health check")
def health():
    return {"status": "ok", "service": "homescope-nyc-api", "version": "0.1.0"}


@app.get("/", summary="Service info")
def root():
    return {
        "service": "homescope-nyc-api",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
