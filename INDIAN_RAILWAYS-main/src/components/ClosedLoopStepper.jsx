import React from 'react';

export default function ClosedLoopStepper({ activeStage = 1, onStageSelect }) {

  const steps = [
    { id: "defect", title: "1. Defect Arrives", desc: "TMS/SMMS/TDMS Feed", icon: "warning", tab: "overview" },
    { id: "ai_risk", title: "2. AI Risk Score", desc: "M1 P(t) & M3 DRI", icon: "psychology", tab: "explainable" },
    { id: "gaps", title: "3. Traffic Gaps", desc: "M4 Headway Mining", icon: "schedule", tab: "architecture" },
    { id: "grouping", title: "4. Joint Grouping", desc: "Civil + S&T + TRD", icon: "layers", tab: "overview" },
    { id: "optimized", title: "5. Optimized Block", desc: "CP-SAT / ALNS Solver", icon: "bolt", tab: "benchmark" },
    { id: "calendar", title: "6. Calendar Slot", desc: "Weekly/Monthly Grid", icon: "calendar_month", tab: "calendar" },
    { id: "conflict", title: "7. Hard Constraints", desc: "Zero Train Overlap", icon: "check_circle", tab: "alerts" },
    { id: "approval", title: "8. Human Approval", desc: "24h Freeze Lock Gate", icon: "verified_user", tab: "emergency" },
    { id: "bdms", title: "9. BDMS Dispatch", desc: "Idempotent Signed Payload", icon: "send", tab: "bdms_audit" },
    { id: "replan", title: "10. Live Replan", desc: "Disruption Execution", icon: "sync", tab: "replanning" }
  ];

  const handleStepClick = (idx, tab) => {
    if (onStageSelect) onStageSelect(idx + 1, tab);
  };

  return (
    <div className="bg-primary text-on-primary p-gutter-md rounded-xl shadow-md mb-gutter-lg border border-secondary-container/40">
      <div className="flex items-center justify-between mb-3 border-b border-primary-container pb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary-fixed text-2xl">route</span>
          <h3 className="font-headline-sm text-headline-sm font-bold text-on-primary">
            BANDHAN Closed-Loop Automatic Block Planning Lifecycle
          </h3>
        </div>
        <span className="bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold px-3 py-1 rounded-full uppercase">
          Interactive Demo Stepper
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2">
        {steps.map((step, idx) => {
          return (
            <div
              key={step.id}
              onClick={() => handleStepClick(idx, step.tab)}
              className={`p-2 rounded-lg cursor-pointer transition-all flex flex-col items-center text-center border ${activeStage === idx + 1 ? "bg-secondary text-on-secondary border-secondary-fixed shadow-md scale-105 font-bold" : "bg-primary-container/40 text-on-primary-container border-transparent hover:bg-primary-container hover:text-on-primary"}`}
            >
              <span className="material-symbols-outlined text-lg mb-1">{step.icon}</span>
              <span className="text-[11px] font-label-sm font-bold leading-tight block">{step.title}</span>
              <span className="text-[9px] opacity-80 mt-0.5 block">{step.desc}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
