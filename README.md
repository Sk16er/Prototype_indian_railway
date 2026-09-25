# BANDHAN Prototype Demo

## Project documentation

- [Project summary and judge-facing workflow](summary.md)
- [Technical ML and scheduling details](ml.md)

## Local judge demo

The local judge demo uses only the FastAPI scheduler and Vite frontend. No gateway process is needed. Use two terminals from the repository root:

1. `python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`
2. `cd INDIAN_RAILWAYS-main && npm install && npm run dev`

Start the scheduler in the first terminal, then the frontend in the second:

`.venv/bin/python -m uvicorn bandhan_ml.scheduler_api.app:app --host 0.0.0.0 --port 8001`

Open the Vite URL shown in the terminal. The login page has a clearly marked **Demo Login** account:

- Username: `judge.demo`
- Password: `BandhanDemo2026!`

These credentials are deterministic and demo-only. FastAPI verifies the credentials and protects dashboard data endpoints; invalid credentials and unauthenticated API requests are rejected. Use **Sign Out** to end the session.

For a different scheduler origin, set `VITE_API_BASE` before starting the frontend. The separate `gateway/` service remains available for the optional Docker/outbox stack, but is not part of the local judge-demo startup.

## What this demo includes / excludes

Includes the scheduler API, ingestion/security adapters, predictive risk helpers, optimizer and operations/dispatch runtime, four requested model source files, two trained joblib artifacts, 500-row sample operational CSVs, and the React frontend with its existing `dist/` build.

Excludes the full 100k `Data_test/` set, benchmark/, tests/, results/, notebooks_or_scripts/, training/evaluation artifacts, M5/M6 implementation and evidence, and Makefile/run_pipeline.py. M5/M6 and benchmark evidence are in the full research repo, not this demo.
