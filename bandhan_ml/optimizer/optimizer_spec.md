# BANDHAN Optimizer — Problem Specification

**Version**: 1.0 | **Author**: BANDHAN SIH 2026 Team  
**Corridor**: Howrah–Jhargram (Eastern Railway) | 17 sections, 18 stations

---

## 1. Data Contract (verified against actual files)

### 1.1 Pending Tasks (from `defect_history.csv` where `status == "OPEN"`)

| Field | Type | Notes |
|---|---|---|
| `defect_id` | str | Unique task ID (e.g. `DEF_01162`) |
| `section_id` | str | One of SEC_01…SEC_17 |
| `asset_type` | str | `Track` → Engineering dept; `OHE` → Electrical dept; `Signal` → S&T dept |
| `defect_type` | str | e.g. `Rail_Weld_Flaw`, `OHE_Stagger_Deviation`, `Signal_Interlocking_Failure` |
| `severity_grade` | int | 1 (minor) → 4 (critical) |
| `initial_severity_grade` | int | Grade at detection (before escalation) |
| `duration_hours` | float | Historical repair duration (used as fallback; M2 p90 used for sizing blocks) |
| `detected_date` | str | ISO datetime string |
| `is_monsoon_detected` | int | 0/1 |

**Departments** (mapped from `asset_type`):
- `Track` → Engineering
- `OHE` → Electrical  
- `Signal` → S&T

### 1.2 Sections (`sections.csv`)

| Field | Type | Notes |
|---|---|---|
| `section_id` | str | SEC_01…SEC_17 |
| `traffic_class` | str | `dense` / `medium` / `light` |
| `num_tracks` | int | Number of parallel tracks (2–3) |
| `max_speed` | int | km/h (90–130) |
| `length_km` | float | Section length |

### 1.3 Timetable (`timetable.csv`)

| Field | Type | Notes |
|---|---|---|
| `section_id` | str | Which section this train uses |
| `train_type` | str | `Suburban_Passenger`, `Express_Passenger`, `Freight_Goods`, `Container_Special` |
| `day_of_week` | int | 0 (Mon) → 6 (Sun) |
| `scheduled_hour` | int | 0–23 (hour of arrival on this section) |
| `occupancy_duration_mins` | int | Minutes the train occupies the section |

**Key insight**: The timetable gives us direct collision windows. A maintenance block at hour H on section S conflicts with any train whose `scheduled_hour == H` (or whose window overlaps with the block).

### 1.4 ML API Endpoints (frozen — do not modify)

| Endpoint | Input | Output | Used For |
|---|---|---|---|
| `POST /predict/escalation_risk` | Full defect record | `safety_risk_probability` [0,1] | Risk exposure term in objective |
| `POST /predict/duration_quantiles` | Full defect record | `p50_duration_hours`, `p90_duration_hours` | Sizing block windows (use p90) |
| `POST /score/priority` | severity, risk, traffic, urgency, overdue_days | `priority_score` [0,100] | Task ranking order |
| `POST /score/gap_fit` | section_id, start_time, duration_hours | `gap_fit_score` [0,1] | Slot quality evaluation |

---

## 2. Decision Variables

For a planning horizon of **H days** (H=7 for weekly, H=30 for monthly), discretized into **1-hour time slots** (T = H × 24 slots):

### Primary Variable
```
x[i, s, t] ∈ {0, 1}
```
- `i` = maintenance task index (pending defect)
- `s` = section ID (must match task's required section)
- `t` = time slot index (0-based hour from planning start)
- `x[i,s,t] = 1` means task `i` is assigned to start in slot `t` on section `s`

### Derived Variable
```
duration[i] = ceil(p90_hours[i] + safety_buffer_hours[i])   [in slots = hours]
```
Block spans slots [t, t + duration[i] - 1]

### Coupling Variable (multi-department consolidation)
```
shared[i, j] ∈ {0, 1}
```
`shared[i,j] = 1` if tasks `i` and `j` are assigned to the same section and overlapping time window (merged into one possession). Tasks `i` and `j` must be from **different departments** and the **same section**.

---

## 3. Objective Function

**Minimize** a weighted combination of penalties MINUS a bonus for consolidation:

```
minimize:
    w_risk   · Σ_i  (1 - x_placed[i]) · risk_prob[i] · severity_norm[i]   [unaddressed risk exposure]
  + w_delay  · Σ_i  Σ_t  x[i,s,t] · (1 - gap_fit[s,t,dur[i]])             [traffic conflict / delay cost]
  + w_frag   · Σ_i  x_placed[i]                                            [fragmentation: minimize #possessions]
  - w_bonus  · Σ_{i,j} shared[i,j]                                         [multi-dept consolidation bonus]
```

Where:
- `x_placed[i] = Σ_{s,t} x[i,s,t]` (1 if task placed at all, 0 if left unscheduled)
- `risk_prob[i]` = M1 safety risk probability from `/predict/escalation_risk`
- `gap_fit[s,t,dur]` = M4 gap-fit score from `/score/gap_fit`
- `severity_norm[i] = severity_grade[i] / 4.0` (normalized 0–1)

**Default weights** (tunable):
```
w_risk  = 0.40   # High: safety is paramount
w_delay = 0.30   # Penalize high-traffic-conflict windows
w_frag  = 0.10   # Mildly discourage too many separate possessions
w_bonus = 0.20   # Reward multi-department co-location
```

**Plain English**: "Schedule as many high-risk tasks as possible, in low-traffic windows (nights/early mornings), while merging tasks from different departments on the same section into shared possession windows — and minimize the total number of separate track possessions needed."

---

## 4. Hard Constraints

### C1: Section Non-Overlap (No Double-Booking)
```
∀ section s, time slot t:
    Σ_i  Σ_{t' : t-dur[i]+1 ≤ t' ≤ t}  x[i,s,t'] · (1 - shared_flag)  ≤  1
```
No two tasks can hold the same section at the same time (unless explicitly merged via `shared[i,j]`).

*Note*: If `num_tracks[s] ≥ 3`, one track can be possessed while others remain open for traffic. The conflict constraint is relaxed for dense 3-track sections — we allow maintenance while trains use other tracks.

### C2: Block Duration Covers p90 Estimate
```
∀ task i:   block_duration[i] ≥ p90_hours[i] + safety_buffer_hours[i]
```
Using M2's `p90_duration_hours` + `recommended_safety_buffer_hours` to size every block.

### C3: Possession Length Bounds
```
∀ task i:   2 hours ≤ block_duration[i] ≤ 8 hours
```
Indian Railways block possession minimum is 2h (setup + teardown); maximum 8h avoids excessive disruption.

### C4: Crew Availability (One Task per Crew per Day)
```
∀ department d, day k:
    Σ_i (dept[i] == d) · (start_day[i] == k) · x_placed[i]  ≤  3
```
Assume **3 crews per department** (Engineering, Electrical, S&T). No department can run more than 3 simultaneous tasks on any given day.

### C5: Timetable Conflict Avoidance
```
∀ task i, slot t, section s:
    if  timetable_conflict(s, t, dur[i])  →  x[i,s,t] = 0
```
A slot is "timetable-conflicted" if any train occupies section `s` during [t, t+dur[i]). Computed from `timetable.csv` as a pre-built binary mask.

### C6: Each Task Assigned At Most Once
```
∀ task i:   Σ_{s,t}  x[i,s,t]  ≤  1
```

---

## 5. Coupling / Consolidation Logic

Two tasks `i` and `j` are **eligible for coupling** if:
1. They belong to **different departments** (e.g. Engineering + S&T)
2. They are on the **same section** (`section_id[i] == section_id[j]`)
3. Their required block durations overlap within a **4-hour window** (coupling tolerance)

When coupled:
- The merged window = `max(end_time[i], end_time[j])` — the longer task sizes the possession
- Both tasks count as one possession (saving track access overhead)
- `w_bonus` credit applied in objective

---

## 6. Time Discretization

- **Slot size**: 1 hour
- **Weekly horizon**: 168 slots (7 days × 24h)
- **Monthly horizon**: 720 slots (30 days × 24h)
- **Preferred maintenance windows**: 01:00–05:00 (off-peak, gap-fit score highest)
- **Blocked slots**: Any hour where timetable shows `> 2 trains` on section in that hour

---

## 7. Sample Records (Sanity Check)

### Pending Tasks (OPEN defects — actual data)
```
defect_id   | section | dept       | severity | defect_type
------------|---------|------------|----------|---------------------------
DEF_01162   | SEC_05  | S&T        | 3        | Signal_Interlocking_Failure
DEF_01178   | SEC_12  | S&T        | 1        | Point_Machine_Wear
DEF_01179   | SEC_01  | Electrical | 4        | OHE_Stagger_Deviation        ← CRITICAL
DEF_01181   | SEC_02  | S&T        | 4        | Signal_Interlocking_Failure  ← CRITICAL
DEF_01190   | SEC_13  | Engineering| 1        | Sleeper_Fastening_Defect
DEF_01193   | SEC_12  | Electrical | 1        | Contact_Wire_Thinning
DEF_01195   | SEC_12  | Engineering| 3        | Sleeper_Fastening_Defect
DEF_01197   | SEC_01  | S&T        | 1        | Track_Circuit_Glitch
DEF_01199   | SEC_01  | S&T        | 1        | Signal_Interlocking_Failure
DEF_01201   | SEC_14  | Engineering| 1        | Sleeper_Fastening_Defect
DEF_01203   | SEC_02  | S&T        | 1        | Point_Machine_Wear
DEF_01213   | SEC_13  | Engineering| 1        | Sleeper_Fastening_Defect
DEF_01217   | SEC_04  | S&T        | 2        | Signal_Interlocking_Failure
DEF_01219   | SEC_09  | S&T        | 1        | Signal_Interlocking_Failure
DEF_01220   | SEC_02  | S&T        | 1        | Point_Machine_Wear
DEF_01224   | SEC_08  | Engineering| 1        | Rail_Weld_Flaw
DEF_01225   | SEC_14  | Engineering| 1        | Sleeper_Fastening_Defect
DEF_01226   | SEC_14  | Engineering| 2        | Sleeper_Fastening_Defect
DEF_01227   | SEC_12  | Electrical | 1        | OHE_Stagger_Deviation
```

**Coupling opportunities visible in data**:
- SEC_12: DEF_01178 (S&T) + DEF_01195 (Engineering) + DEF_01193/01227 (Electrical) — 3-way coupling candidate!
- SEC_01: DEF_01179 (Electrical) + DEF_01197/01199 (S&T) — 2-way coupling
- SEC_02: DEF_01181 (S&T) + DEF_01203/01220 (S&T) — same dept, no coupling bonus but same possession
- SEC_13: DEF_01190 + DEF_01213 (both Engineering) — same dept, share possession
- SEC_14: DEF_01201 + DEF_01225 + DEF_01226 (all Engineering) — share possession

**Estimated consolidation potential**: 19 tasks → ~12–13 possessions (savings of ~6 possessions)

### Timetable Density Example (SEC_01, any week day)
```
Hour  | Trains | Type mix
------|--------|------------------------------------------
00:00 | 2      | Freight_Goods
01:00 | 1      | Freight_Goods              ← BEST WINDOW
02:00 | 1      | Freight_Goods              ← BEST WINDOW
03:00 | 2      | Freight_Goods
04:00 | 3      | Freight + Suburban
05:00 | 5      | Mixed (suburban start)
08:00 | 12     | Peak passenger             ← AVOID
18:00 | 11     | Peak evening               ← AVOID
```
