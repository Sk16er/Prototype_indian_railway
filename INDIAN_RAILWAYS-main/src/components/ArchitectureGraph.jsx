import React from 'react';

export default function ArchitectureGraph({ archData }) {
  const layers = archData?.layers || [
    { id: "ingestion", name: "1 . INGESTION LAYER", components: ["TMS", "SMMS", "TDMS", "COA", "HMAC SHA-256", "ULRS Normalizer", "Spatial Feature Store"] },
    { id: "predictive", name: "2 . PREDICTIVE ENGINE", components: ["M1 Failure Risk P(t)", "M2 Duration Quantiles", "M3 Dynamic Risk Index", "M4 Gap Fit Miner"] },
    { id: "optimization", name: "3 . OPTIMIZATION ENGINE", components: ["Multi-Department Shadow Engine", "Virtual Train Modelling", "Lagrangian Core", "ALNS Solver"] },
    { id: "horizon", name: "4 . OPERATIONAL HORIZON CONTROLLER", components: ["Monthly (T-30d)", "Weekly (T-7d)", "24h Freeze Lock (DRI >= 0.85)"] },
    { id: "dispatch", name: "5 . PRESENTATION & DISPATCH", components: ["WebGL Time-Space Canvas", "Auto-BDMS Submission"] }
  ];

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-gutter-md mb-gutter-lg">
        <div>
          <h2 className="font-display-lg text-headline-md font-bold text-primary tracking-tight">BANDHAN SYSTEM ARCHITECTURE</h2>
          <p className="font-label-md text-label-md text-on-surface-variant">Integrated Predictive Maintenance &amp; Possession Planning — 5-Layer Production Pipeline</p>
        </div>
        <div className="flex items-center gap-2 mt-2 md:mt-0">
          <span className="bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm px-3 py-1 rounded-full font-bold uppercase tracking-wider">
            CRIS Specification Standard
          </span>
          <span className="bg-on-tertiary-container/10 text-on-tertiary-container font-label-sm text-label-sm px-3 py-1 rounded-full font-bold">
            Live Telemetry Operational
          </span>
        </div>
      </div>

      {/* Layer 1: Ingestion Layer */}
      <div className="mb-gutter-md border border-primary-container/30 bg-primary-container/5 rounded-xl p-gutter-md">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-lg text-label-lg font-bold text-primary uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-primary text-on-primary text-xs flex items-center justify-center font-bold">1</span>
            INGESTION LAYER
          </span>
          <span className="text-body-sm font-mono text-outline">PostgreSQL + PostGIS / MongoDB Spatial Store</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter-sm">
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs">
            <div className="font-label-sm text-label-sm text-outline uppercase font-bold mb-1">Source Ingestion Feeds</div>
            <div className="grid grid-cols-2 gap-1 text-label-md font-bold text-primary">
              <span className="bg-surface-container px-2 py-1 rounded">TMS (Track)</span>
              <span className="bg-surface-container px-2 py-1 rounded">SMMS (Signal)</span>
              <span className="bg-surface-container px-2 py-1 rounded">TDMS (TRD)</span>
              <span className="bg-surface-container px-2 py-1 rounded">COA (Control)</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs flex flex-col justify-center">
            <div className="font-label-sm text-label-sm text-outline uppercase font-bold">HMAC Signature Verification</div>
            <div className="font-body-sm text-on-surface font-semibold mt-1">Crypto SHA-256 Headers</div>
            <span className="text-[10px] text-on-tertiary-container font-bold">Unsigned Feeds Rejected</span>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs flex flex-col justify-center">
            <div className="font-label-sm text-label-sm text-outline uppercase font-bold">ULRS Normalizer</div>
            <div className="font-body-sm text-on-surface font-semibold mt-1">Km / Chainage Mapping</div>
            <span className="text-[10px] text-primary font-bold">Station-to-Station Section ID</span>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs flex flex-col justify-center">
            <div className="font-label-sm text-label-sm text-outline uppercase font-bold">Spatial Feature Store</div>
            <div className="font-body-sm text-on-surface font-semibold mt-1">
              {archData?.spatial_feature_store?.total_records || 30} Operational Records
            </div>
            <span className="text-[10px] text-secondary font-bold">Feature Feed Ready</span>
          </div>
        </div>
      </div>

      {/* Layer 2: Predictive Engine */}
      <div className="mb-gutter-md border border-on-tertiary-container/30 bg-on-tertiary-container/5 rounded-xl p-gutter-md">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-lg text-label-lg font-bold text-on-tertiary-container uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-on-tertiary-container text-on-tertiary text-xs flex items-center justify-center font-bold">2</span>
            PREDICTIVE ENGINE
          </span>
          <span className="text-body-sm font-mono text-outline">XGBoost + Platt Calibration + LightGBM</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-gutter-sm">
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs">
            <div className="font-label-sm text-label-sm text-on-tertiary-container font-bold uppercase">M1 — Defect Failure Risk</div>
            <div className="font-headline-sm text-title-lg font-bold text-primary mt-1">P(t) Risk Score</div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">Asymmetric loss α = 0.92, Platt calibrated</p>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs">
            <div className="font-label-sm text-label-sm text-on-tertiary-container font-bold uppercase">M2 — Duration Quantiles</div>
            <div className="font-headline-sm text-title-lg font-bold text-secondary mt-1">P50 &amp; P90 Repair Curves</div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">Accelerated failure time survival model</p>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs">
            <div className="font-label-sm text-label-sm text-on-tertiary-container font-bold uppercase">M3 — Dynamic Risk Index</div>
            <div className="font-headline-sm text-title-lg font-bold text-tertiary-container mt-1">DRI Composite</div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">Failure × Overdue × TSR × Criticality</p>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs">
            <div className="font-label-sm text-label-sm text-on-tertiary-container font-bold uppercase">M4 — Gap Fit Miner</div>
            <div className="font-headline-sm text-title-lg font-bold text-primary mt-1">Headway Gap Fit</div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">Bueno pillar COA timetable mining</p>
          </div>
        </div>
      </div>

      {/* Layer 3: Optimization Engine */}
      <div className="mb-gutter-md border border-secondary/30 bg-secondary/5 rounded-xl p-gutter-md">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-lg text-label-lg font-bold text-secondary uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-secondary text-on-secondary text-xs flex items-center justify-center font-bold">3</span>
            OPTIMIZATION ENGINE
          </span>
          <span className="text-body-sm font-mono text-outline">Luan Virtual Train MILP + ALNS + Lagrangian</span>
        </div>
        <div className="space-y-2">
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span className="font-label-md text-label-md font-bold text-primary">Multi-Department Shadow Engine</span>
              <p className="text-body-sm text-on-surface-variant">Groups Civil (TMS) + Signal (SMMS) + Electrical (TDMS) into single joint possessions</p>
            </div>
            <span className="bg-secondary-fixed text-on-secondary-fixed px-3 py-1 rounded text-label-sm font-bold">
              Budai-Dekker Savings: ~{archData?.multi_department_shadows?.consolidation_bonus_pct || 33.3}%
            </span>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span className="font-label-md text-label-md font-bold text-primary">Virtual Train Modelling (Luan et al.)</span>
              <p className="text-body-sm text-on-surface-variant">Maintenance block windows modeled as virtual trains occupying capacity in a time-space network</p>
            </div>
            <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded text-label-sm font-bold">
              {archData?.virtual_trains_count || 12} Active Trajectories
            </span>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span className="font-label-md text-label-md font-bold text-primary">Lagrangian Decomposition Core &amp; ALNS Solver</span>
              <p className="text-body-sm text-on-surface-variant">Dualizes capacity constraints λ(s, t) to solve parallel subproblems with P90 chance constraints</p>
            </div>
            <span className="bg-surface-container-high text-primary px-3 py-1 rounded text-label-sm font-bold">
              Dual Gap: {archData?.lagrangian_dual_bounds?.duality_gap_pct || 4.2}%
            </span>
          </div>
        </div>
      </div>

      {/* Layer 4: Operational Horizon Controller */}
      <div className="mb-gutter-md border border-outline/30 bg-surface-container-high/30 rounded-xl p-gutter-md">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-lg text-label-lg font-bold text-primary uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-primary text-on-primary text-xs flex items-center justify-center font-bold">4</span>
            OPERATIONAL HORIZON CONTROLLER
          </span>
          <span className="text-body-sm font-mono text-outline">Rolling Horizon Freeze Window</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-sm">
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs">
            <span className="font-label-sm text-label-sm uppercase font-bold text-primary">Monthly Strategic Plan</span>
            <div className="font-title-lg text-title-lg font-bold text-on-surface mt-1">T-30d → T-7d</div>
            <p className="text-body-sm text-on-surface-variant">Long-cycle renewals &amp; machine fleet tours</p>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/40 shadow-xs">
            <span className="font-label-sm text-label-sm uppercase font-bold text-secondary">Weekly Operational Schedule</span>
            <div className="font-title-lg text-title-lg font-bold text-on-surface mt-1">T-7d → T-24h</div>
            <p className="text-body-sm text-on-surface-variant">Slotted against live COA train graph strings</p>
          </div>
          <div className="bg-surface-container-lowest p-3 rounded-lg border border-error/40 shadow-xs">
            <span className="font-label-sm text-label-sm uppercase font-bold text-error">24h Freeze Window Execution Lock</span>
            <div className="font-title-lg text-title-lg font-bold text-error mt-1">Override Gate: DRI ≥ 0.85</div>
            <p className="text-body-sm text-on-surface-variant">Locks schedule stability unless safety critical</p>
          </div>
        </div>
      </div>

      {/* Layer 5: Presentation & Dispatch */}
      <div className="border border-primary/30 bg-primary/5 rounded-xl p-gutter-md">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-lg text-label-lg font-bold text-primary uppercase tracking-wider flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-primary text-on-primary text-xs flex items-center justify-center font-bold">5</span>
            PRESENTATION &amp; DISPATCH
          </span>
          <span className="text-body-sm font-mono text-outline">WebGL / SVG Canvas &amp; BDMS API</span>
        </div>
        <div className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant/40 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="font-headline-sm text-headline-sm font-bold text-primary">WebGL Time-Space Canvas &amp; Auto-BDMS Submission</h4>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Government-Authorized CRIS Portal UI with real-time trajectory canvas and signed BDMS submission payload</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-primary text-on-primary font-label-sm text-label-sm px-3 py-1.5 rounded font-bold uppercase">
              BDMS Signed Payload Ready
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
