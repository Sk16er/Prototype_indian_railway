# BANDHAN | Project Summary

## At a Glance

**BANDHAN** is a prototype decision-support system for planning engineering possessions: temporary track-access windows needed to inspect, repair, or maintain railway assets. It brings maintenance requests, section and timetable context, risk and duration estimates, scheduling, disruption replanning, and review tools into one workflow.

The central idea is straightforward: **prioritize the work that matters, find a workable time window, make the trade-offs visible, and keep a human in control of operational decisions.**

This repository is an SIH demonstration prototype. Its bundled records and demonstration views are synthetic/sample data; they are not live Indian Railways operational records.

## Why It Matters

Maintenance planning is a coordination problem as much as a scheduling problem. A useful plan must consider more than defect severity. It should take account of risk, expected work duration, section characteristics, timetable occupancy, available crews, and the effects of disruptions. It should also make it possible to inspect why a task was prioritized and what changes when conditions change.

BANDHAN demonstrates this connected workflow in a single application rather than presenting model predictions in isolation.

## Judge-Facing Workflow

1. **Review work and risk.** The task view enriches open sample defects with department, risk, duration, and priority context.
2. **Build a possession plan.** The planner creates a weekly or monthly schedule using the selected method and the available section/timetable fixtures.
3. **Inspect the schedule.** The calendar groups possession windows by date and department; selecting a block reveals its section, time, duration, and scores.
4. **Respond to a disruption.** The replanning workflow injects a demo defect burst or freight-surge scenario, re-solves the affected scope, and returns a change list.
5. **Review safety and execution.** The emergency screen demonstrates a risk-based freeze-window gate. The execution view presents a planned-versus-demo-execution ledger.
6. **Inspect evidence and outputs.** ML evidence, comparison, architecture, audit, and dispatch-preview views provide context for the prototype outputs.

The dashboard also includes corridor visualization, a time-space view, a what-if sandbox, conflict alerts, a closed-loop planning stepper, and a read-only Control Copilot.

## What Makes the Prototype Strong

- **End-to-end decision support:** predictions are connected to scheduling and operator-facing review, rather than stopping at a score.
- **Risk-aware prioritization:** a calibrated escalation-risk estimate, maintenance urgency, severity, overdue time, and section traffic contribute to task ranking.
- **Uncertainty-aware work windows:** duration quantiles provide a more cautious planning input than a single historical average.
- **Traffic-contextual scheduling:** candidate windows are assessed against a timetable-derived conflict profile and a time-of-day gap-fit heuristic.
- **Multiple planning approaches:** a severity-first baseline, a constructive smart heuristic, and a CP-SAT-backed optimization path can be compared.
- **Disruption response:** the replanner can add synthetic defect work or alter freight demand, then present a schedule diff.
- **Human-readable controls:** the calendar, emergency gate, evidence panel, schedule inspector, and dispatch preview are designed to expose decisions for review.
- **A single-service local demo:** FastAPI handles authentication and data APIs; Vite serves the React interface. The separate gateway is optional for the local judge flow.

## System Shape

```text
React dashboard
    |  authenticated API calls
    v
FastAPI scheduler and demo authentication
    |  source adapters
    +---- configured REST feeds (optional)
    +---- bundled sample CSV fixtures (default)
    |
    +---- risk and duration inference
    +---- priority and gap-fit scoring
    +---- baseline / heuristic / CP-SAT scheduling
    +---- schedule verification and API responses
```

The main implementation areas are:

- `INDIAN_RAILWAYS-main/src/`: React application, dashboard components, styles, and API client.
- `bandhan_ml/scheduler_api/`: FastAPI endpoints, authentication, planning and evidence responses.
- `bandhan_ml/models/` and `bandhan_ml/features/`: model source, feature columns, and preprocessing.
- `bandhan_ml/optimizer/`: data loading, scheduling methods, planning horizons, comparison, and verification.
- `bandhan_ml/integrations/` and `bandhan_ml/ingestion/`: configurable source adapters and canonical graph normalization.
- `bandhan_ml/data/`: bundled sample operational fixtures.

## Local Judge Demo

The local demo needs two running services. From the repository root:

1. Install Python dependencies: `python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`
2. In the first terminal, start FastAPI: `.venv/bin/python -m uvicorn bandhan_ml.scheduler_api.app:app --host 0.0.0.0 --port 8001`
3. In the second terminal, start the frontend: `cd INDIAN_RAILWAYS-main && npm install && npm run dev`

Open the Vite URL printed in the second terminal. The login page includes a clearly labelled demo account:

- **Username:** `judge.demo`
- **Password:** `BandhanDemo2026!`

The demo account is for this prototype only. If port `8001` is already occupied by a running scheduler, use that process rather than starting another copy.

## Important Boundaries

- **The bundled CSVs and prepared ML evidence are synthetic/sample evidence.** They are useful for demonstrating reproducibility and workflow, not for asserting real-world accuracy or operational benefit.
- **Live-source adapters are integration points, not proof of a live connection.** They can read configured endpoints, but no railway source credentials or production feeds are included in this demo.
- **The Live Portal contains presentation/sample records.** Its sample row actions and refresh behavior are demo interactions; they do not dispatch railway work or update an operational system.
- **Execution and scenario data are demonstrative.** The execution monitor and disruption scenarios do not represent actual train movements or worksite telemetry.
- **The freeze-window check is a prototype rule.** Real deployment would require approved operational policy, identity integration, audit controls, and safety validation.
- **The account and signing-secret defaults are demo-only.** They must be replaced with managed identity, deployment secrets, and production-grade authorization before any non-demo use.
- **The included saved model artifacts cover M1 and M2.** M5/M6 outputs and evidence are optional result-file inputs and may show as unavailable when those files are not present.

## Further Reading

- [Technical ML and scheduling notes](ml.md)
- [Local startup and repository scope](README.md)
