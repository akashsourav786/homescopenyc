# HomeScope NYC API — Stage 6

FastAPI backend that ports the three TypeScript calculator engines
(`lib/calculators/`) to Python with exact numeric parity, and exposes them
as REST endpoints. Stateless: no database, no env vars.

## Run locally

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

- Health: http://localhost:8000/health
- Interactive docs: http://localhost:8000/docs

## Run tests

```bash
cd backend
.venv/bin/python -m pytest tests/ -q
```

`tests/test_parity.py` pins the engines to the TypeScript fixtures
($474k/$688k client fixture, $519,250 seller fixture, $42,000 closing on the
$1.2M monthly-cost fixture, …). `tests/test_api.py` covers the endpoints.

## API overview

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/v1/loan-programs` | Program configs, credit tiers, property types |
| POST | `/api/v1/qualify` | Buyer qualification (conservative + higher) |
| POST | `/api/v1/monthly-cost` | Monthly breakdown + NYC cash to close |
| POST | `/api/v1/seller-proceeds` | Deduction waterfall → net proceeds |

Validation failures return HTTP 422 with the engine's `{field, code, message}`
issue list — the same shape the frontend already renders.

## Deploying

Akash needs to connect his own hosting account — Render, Railway, or Fly all
work. The service is stateless and needs no environment variables:

- **Render:** New → Web Service → this repo, Root Directory `backend`
  (a `render.yaml` sketch is included; `Dockerfile` also included).
- **Railway / Fly:** point at `backend/`; start command
  `uvicorn app.main:app --host 0.0.0.0 --port 8000`.

CORS currently allows `https://homescopenyc.vercel.app` plus localhost.

## Parity notes

- Python's `round()` is banker's rounding; the engines use a `round2`
  half-up helper (`app/_numeric.py`) to match JS `Math.round` exactly.
- Max price floors to the nearest $1,000 with `math.floor`, like the TS side.
- Request/response field names are camelCase, mirroring the TS interfaces.
