# BANDHAN | ML and Scheduling Technical Notes

## Scope and Data Status

This document describes the model and scheduling code included in the repository. The project includes two serialized model artifacts (`m1_escalation.joblib` and `m2_duration.joblib`), source code for M1-M4, and optional result-file consumers for M5/M6. The packaged operational CSVs are small sample fixtures; model source comments describe a larger harvested/synthetic training workflow that is not included in this demo package.

**All bundled records and displayed ML evidence must be treated as synthetic/demo evidence.** The repository does not provide a production railway dataset, live railway telemetry, or an external validation study. No accuracy or operational-impact claim in this note should be interpreted as field validation.

## End-to-End Decision Path

```text
Sample or configured source feeds
        |
        v
Normalize open defects, sections, timetable, and forecast inputs
        |
        +--> M1 risk probability ------------+
        |                                     |
        +--> M2 p50/p90 duration -------------+--> M3 priority ranking
        |                                     |
        +--> timetable + section context -----+--> M4 candidate-window fit
                                              |
                                              v
                                    Weekly/monthly planner
                                   (baseline / heuristic / CP-SAT)
                                              |
                                              v
                               plan response + verifier + evidence UI
                                              |
                         disruption scenario --> partial replan + diff
```

At planning time, Python calls the model/scoring helpers directly instead of making an HTTP round trip per task. FastAPI exposes the user-facing login and planning endpoints; it also serves task, schedule, evidence, and Copilot API data.

## Data and Feature Engineering

### Operational Inputs

`bandhan_ml/integrations/sources.py` defines source adapters for:

- TMS, SMMS, and TDMS maintenance/defect work;
- corridor/section metadata;
- COA timetable rows;
- goods-train forecast data;
- BDMS-related section data.

When a `BANDHAN_<SOURCE>_URL` is configured, the adapter reads JSON from that endpoint. In the local prototype, CSV fixtures are used by default. Failed configured sources can fall back to a local fixture and are marked in freshness metadata. A fallback is not a live railway feed.

`load_pending_tasks()` selects open defects, maps asset types to departments, maps numeric severity grades to labels, derives overdue days relative to the planning date, and sets a simple urgency proxy from severity. These derived fields support demonstration scheduling and should not be mistaken for source-system approvals or measured operational urgency.

### Model Feature Matrix

`bandhan_ml/features/pipeline.py` defines the shared model feature list. It includes encoded categorical fields and numeric inspection, asset, maintenance, traffic, weather, resource, criticality, urgency, and operational-impact attributes, including:

- department, asset type, corridor class, defect type, and weather codes;
- defect length/depth/count and asset age;
- time since maintenance, overdue days, and inspection score;
- traffic density, daily/passenger/goods train counts, average speed, and trains affected;
- temperature/rainfall, previous failures, resource availability, asset criticality, urgency, and operational impact.

Categorical encoders are fitted on the training split and reused during inference. Unknown categories are mapped to the first known class. For sparse source records, inference builders fill missing numeric features with zero and unknown categories with a safe encoded value. This makes inference robust but can reduce the information available to the model. The tasks API marks feature completeness as `complete` or `imputed` for a subset of important fields.

The feature module explicitly excludes outcome-like fields such as final severity, maintenance priority, maintenance duration, safety risk, priority class, and asset downtime from the M1 input feature list. M1's target is the supplied safety-risk label, rather than a target constructed from final severity.

## Model Responsibilities

### M1: Safety / Escalation Risk

**Purpose:** estimate the probability that a maintenance case belongs to a high/critical safety-risk class. The calibrated probability is used as an input to priority scoring and optimizer task ranking.

**Implementation:** XGBoost binary classifier (`XGBClassifier`) with class weighting (`scale_pos_weight`) to account for an imbalanced target. Training code wraps the base classifier in `CalibratedClassifierCV` using sigmoid/Platt calibration. Calibration matters because downstream scheduling treats the output as a probability-like risk signal, not just a class label.

**Training outputs:** the training script computes precision-recall AUC, an F2 threshold sweep, raw and calibrated Brier scores, calibration curves, precision-recall curves, and SHAP-based feature summaries. These describe the training script's evaluation process; they are not claims of performance on real railway data.

**Inference:** the API and optimizer load the serialized payload, encode the configured feature columns, and call calibrated `predict_proba`. If model loading or prediction fails, the current inference helper falls back to a bounded severity-derived proxy. That fallback preserves planner operation but is **not an M1 prediction**; model availability and data completeness should be considered when interpreting the result.

### M2: Maintenance Duration Quantiles

**Purpose:** estimate repair duration with uncertainty so that a possession can be sized conservatively instead of using only a point estimate.

**Implementation:** two LightGBM quantile regressors, one at alpha `0.50` for the median and one at alpha `0.90` for an upper duration quantile. Training evaluates pinball loss and empirical p90 exceedance/coverage.

**Groupwise conformal calibration:** the training code fits `GroupwiseCQR` using a held-out calibration split. It computes nonconformity scores from observed durations relative to the lower/upper quantiles, calibrates a global adjustment, and stores group adjustments by department and asset type. The training payload also records interval coverage metrics. One implementation detail matters: the current `predict_duration_direct()` planner helper uses the saved p50/p90 regressors directly; it does not apply the stored CQR adjustment when creating a schedule. Therefore the calibrated interval metrics describe the training/evaluation path, while the planner's present duration input is the raw p90 plus the current buffer logic.

**Planner use:** the duration helper returns `p50`, `p90`, and a buffer (`p90 - p50`). The scheduling code sizes work using p90 plus a safety buffer, then bounds the duration to the planner's configured minimum and maximum possession lengths. If M2 cannot be loaded, it falls back to historical duration multiplied by a fixed buffer factor; this is a fallback estimate, not model output.

### M3: Priority Score and Dynamic Risk Index

M3 in `models/m3_priority.py` is a deterministic weighted scoring function, not a learned estimator. It normalizes and combines:

- defect severity;
- M1 escalation-risk probability;
- section traffic density;
- urgency;
- overdue days.

The default weights are read from configuration when available; code defaults are 0.30 severity, 0.35 escalation risk, 0.15 traffic, 0.10 urgency, and 0.10 overdue. Inputs are normalized, combined, divided by the sum of weights, and returned on a 0-100 scale.

The separate `predictive/risk_index.py` computes a Dynamic Risk Index (DRI) in `[0, 1]` from failure risk, overdue status, TSR/operational impact, and criticality. In the current formula the weights are 0.55, 0.20, 0.15, and 0.10 respectively. The emergency workflow demonstrates a threshold gate at DRI `>= 0.85`; it is a prototype policy demonstration, not an approved railway operating rule.

### M4: Traffic Gap-Fit Scoring

M4 is a deterministic timetable/context heuristic, not a separately trained ML model. It estimates the suitability of a proposed section/time/duration window on a `[0, 1]` scale. When its larger training split is available, the implementation derives section-level mean traffic information from that split, adjusts congestion by hour-of-day factors, averages the estimated occupancy penalties across the requested duration, and returns one minus that penalty. Off-peak hours receive a lower modeled passenger-traffic factor than morning/evening peak hours. That training split is not in this demo package; if loading it fails, the optimizer's wrapper uses a simpler hour-of-day fallback score instead.

The optimizer separately builds a timetable conflict bitmap from sample train rows. It counts train occupancy by section and hour, taking the section's track count into account when deciding hard conflicts. M4's gap-fit score refines the ranking among candidate windows; it should not be confused with a live timetable guarantee.

### M5 and M6: Optional Evidence Inputs

The evidence endpoint reads optional generated result files such as `m5_metrics.json`, `m6_metrics.json`, and `m5_predictions.csv` when those files exist. The API contains an M5-derived predicted-block-demand response shape, and the frontend displays available evidence with explicit synthetic labels. These result files and complete M5/M6 training implementations are not included in the demo package. When files are absent, the endpoint returns an unavailable/empty state rather than proving an M5/M6 prediction was made.

## Scheduling and Optimization

### Shared Constraints and Enrichment

`optimizer/data_utils.py` defines the planning date, one-hour time slots, minimum and maximum block lengths, and a per-department daily crew limit. It builds a timetable conflict array per section and generates candidate windows without overlapping already placed maintenance work.

For each task, the smart planner uses the M1-derived risk input and M3 priority to rank the work, sizes the block using M2 p90 plus buffer, evaluates available slots with M4, and enforces crew availability. Cross-department work on the same section can be labelled as a consolidation opportunity when its intervals are within a configured proximity window.

### Planning Methods

- **Baseline:** sorts primarily by severity and assigns the first candidate window; it uses historical duration and does not optimize gap-fit. It exists as a comparison reference.
- **Greedy smart heuristic:** ranks by M3, uses M2 p90 sizing, chooses among low-conflict candidate windows using M4, enforces crew limits, then detects cross-department coupling groups.
- **Optimized planner:** builds a greedy warm start and attempts an OR-Tools CP-SAT schedule. The model uses optional interval variables and section-level `NoOverlap` constraints, along with per-department/day crew limits and placement rewards/penalties. If CP-SAT is unavailable or fails, the code can fall back to an Adaptive Large Neighborhood Search (ALNS) procedure with destroy/repair moves and simulated-annealing acceptance.

The optimizer code and its comments describe intended objectives including placement of high-priority tasks, lower-conflict windows, fewer fragmented possessions, and consolidation. The current CP-SAT implementation uses a simplified, static conflict penalty around the warm-start slots; it is not a full exact encoding of every timetable-dependent objective described in the separate optimizer specification. Treat its output as a candidate plan for review, not an operationally certified optimum.

### Weekly, Monthly, and Disruption Planning

- **Weekly:** plans open tasks within a seven-day horizon against the fixture timetable.
- **Monthly:** uses a 30-day horizon for a broader coarse plan.
- **Replan:** a deterministic demo scenario can inject a defect burst or adjust freight volume, re-optimize affected tasks, preserve the rest of the existing plan as frozen, and return a task-level diff.

Plan responses include schedule records and summary KPIs. Some KPI values are proxies derived from fixtures and heuristic scores; for example, estimated delay minutes are not measured train-delay telemetry.

### Independent Verification

`verify_schedule()` checks positive and bounded durations and overlapping task intervals on the same section/day. The verification report is attached to the plan. This is a useful independent structural check, but its current scope is narrower than a full railway safety case: it does not by itself certify route setting, possession authority, signaling interlocks, crew qualifications, or live train occupancy.

## Evidence and Interpretation

The ML evidence panel reports metrics only when the relevant generated result files are present. Values should be interpreted as evidence from the repository's synthetic/seeding pipeline. They are not production accuracy figures or proof of deployment performance.

For a fair technical review, distinguish:

1. **Learned estimates:** M1 risk probability and M2 duration quantiles.
2. **Deterministic scoring:** M3 priority and DRI formula.
3. **Context heuristic:** M4 gap-fit.
4. **Constraint-based planning:** baseline, greedy heuristic, CP-SAT, and optional ALNS.
5. **Evidence/validation:** synthetic metric files and structural plan verification.

The strongest claim supported by this repository is that it demonstrates an integrated and inspectable prototype workflow with explicit modeling, planning, scenario, and verification components. Claims about operational safety, field accuracy, saved railway time, or real train-delay reductions require representative railway data, domain review, and prospective validation.

## Main Technical Entry Points

- Feature list and preprocessing: `bandhan_ml/features/pipeline.py`
- M1 classifier training: `bandhan_ml/models/m1_escalation.py`
- M2 quantile/CQR training: `bandhan_ml/models/m2_duration.py`
- M3 priority scoring: `bandhan_ml/models/m3_priority.py`
- M4 gap-fit heuristic: `bandhan_ml/models/m4_gap_miner.py`
- Risk-index formula: `bandhan_ml/predictive/risk_index.py`
- Data loading, conflict arrays, and inference fallbacks: `bandhan_ml/optimizer/data_utils.py`
- Constructive scheduler: `bandhan_ml/optimizer/smart_scheduler.py`
- CP-SAT / ALNS core: `bandhan_ml/optimizer/optimizer_core.py`
- Weekly/monthly/replan orchestration: `bandhan_ml/optimizer/planner.py`
- Verification and KPI helpers: `bandhan_ml/optimizer/evidence_metrics.py` and `bandhan_ml/optimizer/evaluator.py`
- API and evidence responses: `bandhan_ml/scheduler_api/app.py`
- Evidence presentation: `INDIAN_RAILWAYS-main/src/components/MlEvidencePanel.jsx`
