# HomeScope NYC — Stage 6 Notes
## Python/FastAPI Backend

**Status:** ✅ Complete — `pytest` 50/50 pass, `uvicorn` boots, `/health` + `/docs` verified live.
**Date:** 2026-10-10

---

## 1. What was built (and why)

The backend counterpart to the three calculator engines. Same philosophy as
the frontend stages: **the math lives in pure Python engine modules**
(`backend/app/`) with zero FastAPI imports, and the HTTP layer
(`routers/`, `main.py`) is a thin shell over them. The engines reproduce the
TypeScript implementations **exactly** — same closed-form DTI solve, same
$1,000 flooring, same half-up rounding, same tax brackets — proven by
`tests/test_parity.py` against the pinned TS fixtures.

### Files created
- `backend/app/loan_programs.py` — port of `loan-programs.ts`: program
  configs (DTI caps, MI rules, sources), `dti_cap_justifications()`,
  `CREDIT_TIERS`, multifamily min-downs, 75% rental haircut.
- `backend/app/buying_power.py` — port of `buyer-qualification.ts`:
  `monthly_payment()`, `validate_inputs()`, closed-form
  `solve_max_price()`, `build_result()`, `qualify_buyer()` (conservative +
  higher, no rate cushion), `sensitivity()`.
- `backend/app/monthly_cost.py` — port of `monthly-cost.ts`:
  `recording_tax()` (1.80% <$500k / 1.925% ≥$500k), 8-tier `mansion_tax()`
  on the full price, 3.5% misc plug, `calculate_monthly_cost()`.
- `backend/app/seller_proceeds.py` — port of `seller-proceeds.ts`:
  `nyc_transfer_tax()` (1% ≤$500k / 1.425% of full price above),
  `nys_transfer_tax()` (0.4%), `estimate_proceeds()` waterfall.
- `backend/app/_numeric.py` — `round2()` half-up helper (Python's
  `round()` is banker's rounding — this matches JS `Math.round` exactly),
  plus `money()`, `is_num()`, `is_int()`.
- `backend/app/models.py` — Pydantic v2 request/response models mirroring
  the TS interfaces (camelCase field names).
- `backend/app/routers/calculators.py` — `POST /api/v1/qualify`,
  `POST /api/v1/monthly-cost`, `POST /api/v1/seller-proceeds`,
  `GET /api/v1/loan-programs`. Validation failures → HTTP 422 with the
  engine's `{field, code, message}` issues.
- `backend/app/main.py` — FastAPI app, CORS (homescopenyc.vercel.app +
  localhost), `/health`, `/`.
- `backend/tests/test_parity.py` — 35 engine parity + validation tests.
- `backend/tests/test_api.py` — 15 endpoint tests (TestClient).
- `backend/requirements.txt` — pinned: fastapi 0.115.6, uvicorn 0.34.0,
  pydantic 2.10.4, pytest 8.3.4, httpx 0.28.1.
- `backend/Dockerfile` — python:3.12-slim + uvicorn.
- `backend/render.yaml` — Render deploy sketch (docs only).
- `backend/README.md` — run/test/API/deploy docs.
- `STAGE6_NOTES.md` — this file.

### Files changed
- None in the frontend. Backend-only stage by design.

### Deliberate decisions
- **No frontend changes.** The Next.js app keeps its client-side math;
  frontend wiring to this API happens after the backend is deployed, which
  needs Akash's hosting account (out of scope for this stage).
- **No database** (that's Stage 8). The service is stateless, no env vars.
- **`.venv/` lives inside `backend/`** and is git-ignored via the repo's
  `.gitignore` (venv entry) — do not commit it.
- Pydantic models use camelCase to mirror the TS interfaces 1:1, so a
  future frontend fetch is a mechanical mapping.
- `sensitivity()` is ported in the engine but **not exposed** as an
  endpoint (no spec for it); easy to add later.

---

## 2. Parity fixtures verified (all exact)

- Client fixture (130k income, $0 debt, 10% down, 6.5%, $6k tax, $2.4k
  insurance, conventional): conservative **$474,000**, higher **$688,000**,
  front-end DTI binding, same 6.5% rate both scenarios (no cushion).
- Seller fixture ($1M sale, $400k mortgage, 6%, $2,500 attorney): net
  **$519,250**, deductions [400000, 60000, 14250, 4000, 2500].
- Monthly-cost $1.2M/10% down: closing **$42,000** (recording $20,790,
  mansion $12,000, title $5,400, attorney $3,500, misc $310), cash to close
  **$162,000**.
- $800k/50% down: misc **$13,700**, closing total **$28,000**.
- $2.5M/10% down: NO misc line (modeled 3.57% > 3.5% benchmark).
- Multifamily: 2-unit min 15%, 3–4 unit 25%; rental income counted at
  exactly 75% ($2,000 → $1,500); single-family ignores the field.
- DTI caps: conventional 33/43 & 45/50; FHA 31/43 & 47/57; VA 41/41 & 45/50.
- Credit tier behaves as a pure rate change (tier "low" ≡ base rate +0.75%),
  never a multiplier — same as the TS rule.

---

## 3. How to run

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests/ -q        # 50/50 expected
.venv/bin/uvicorn app.main:app --port 8000  # → http://localhost:8000/docs
```

## 4. Verification (actually ran)

- `pytest tests/`: **50/50 pass** (35 parity + 15 API).
- `uvicorn` booted; `GET /health` → `{"status":"ok",...}`; `GET /docs`
  → HTTP 200; live `POST /api/v1/qualify` returned the $474k fixture.
- Python 3.12.3, venv-local install only (nothing system-wide).

## 5. Manual checks for Akash (after deploy)

- `GET /health` → ok.
- `POST /api/v1/qualify` with the client fixture → 474000 / 688000.
- `POST /api/v1/seller-proceeds` with the $1M fixture → 519250.
- Open `/docs` — all four endpoints listed with schemas.

## 6. Troubleshooting

- `pip install` failures: the venv pins are tested on Python 3.12; use
  `python3 -m venv` fresh if the env gets polluted.
- Port in use: `uvicorn app.main:app --port 8001`.
- CORS: only `https://homescopenyc.vercel.app` and localhost are allowed;
  add origins in `app/main.py` if the preview URL changes.

## 7. Next stage preview

**Stage 7 — NYC property data:** real property intelligence from NYC open
data (ACRIS / PLUTO / HPD) served through this API — the reason the
backend exists. Frontend wiring (calling these endpoints instead of the
client-side math) follows once the backend is deployed on Akash's hosting
account.

---

## 8. Open items / known limitations

- `package-lock.json` still not in GitHub (pre-existing, unrelated).
- `backend/.venv/` must stay out of git (gitignore covers `venv`/`.venv` —
  verify on push).
- No auth, no rate limiting, no persistence — fine for stateless estimates;
  revisit if the API is exposed beyond the frontend.
