# BANDHAN Prototype Demo

## Run

From this folder, use two terminals:

1. `python -m uvicorn bandhan_ml.scheduler_api.app:app --host 0.0.0.0 --port 8001`
2. `cd INDIAN_RAILWAYS-main && npm run dev`

Install Python dependencies first with `python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`. Install frontend dependencies with `cd INDIAN_RAILWAYS-main && npm install`.

The frontend defaults to `http://localhost:8001`; set `VITE_API_BASE` to use another API origin.

## What this demo includes / excludes

Includes the scheduler API, ingestion/security adapters, predictive risk helpers, optimizer and operations/dispatch runtime, four requested model source files, two trained joblib artifacts, 500-row sample operational CSVs, and the React frontend with its existing `dist/` build.

Excludes the full 100k `Data_test/` set, benchmark/, tests/, results/, notebooks_or_scripts/, training/evaluation artifacts, M5/M6 implementation and evidence, and Makefile/run_pipeline.py. M5/M6 and benchmark evidence are in the full research repo, not this demo.
