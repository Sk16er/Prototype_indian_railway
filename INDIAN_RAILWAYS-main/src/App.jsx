import React, { useState, useEffect } from 'react';
import ArchitectureGraph from './components/ArchitectureGraph';
import TimeSpaceCanvas from './components/TimeSpaceCanvas';
import BenchmarkComparison from './components/BenchmarkComparison';
import ExplainableScheduleInspector from './components/ExplainableScheduleInspector';
import ClosedLoopStepper from './components/ClosedLoopStepper';
import ControlRoomOverview from './components/ControlRoomOverview';
import CalendarView from './components/CalendarView';
import ReplanningCenter from './components/ReplanningCenter';
import EmergencyWorkflow from './components/EmergencyWorkflow';
import ExecutionMonitor from './components/ExecutionMonitor';
import CorridorMap from './components/CorridorMap';
import ConflictAlertCenter from './components/ConflictAlertCenter';
import WhatIfSimulator from './components/WhatIfSimulator';
import BdmsLifecycleTracker from './components/BdmsLifecycleTracker';
import AuditTrail from './components/AuditTrail';
import LivePortalMode from './components/LivePortalMode';
import MlEvidencePanel from './components/MlEvidencePanel';
import {
  fetchHealth,
  fetchArchitecture,
  fetchTasks,
  fetchWeeklyPlan,
  fetchMonthlyPlan,
  fetchReplan,
  fetchComparison,
  fetchTimeSpaceGraph,
  fetchDispatchPreview,
  checkFreezeLock
  ,fetchMlEvidence
  ,fetchPredictedBlockDemand
} from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState("live_portal");
  const [activeStage, setActiveStage] = useState(1);
  const [healthData, setHealthData] = useState(null);
  const [archData, setArchData] = useState(null);
  const [taskList, setTaskList] = useState([]);
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [canvasData, setCanvasData] = useState(null);
  const [dispatchPayload, setDispatchPayload] = useState(null);
  const [freezeModal, setFreezeModal] = useState(null);
  const [showBdmsModal, setShowBdmsModal] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("optimized");
  const [selectedHorizon, setSelectedHorizon] = useState("weekly");
  const [isSolving, setIsSolving] = useState(false);
  const [mlEvidence, setMlEvidence] = useState(null);
  const [predictedDemand, setPredictedDemand] = useState(null);

  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    async function loadBackend() {
      const h = await fetchHealth();
      setHealthData(h);

      const a = await fetchArchitecture();
      setArchData(a);

      const t = await fetchTasks();
      setTaskList(t);

      const p = await fetchWeeklyPlan("optimized");
      setWeeklyPlan(p);

      const comp = await fetchComparison();
      setComparisonData(comp);
      setMlEvidence(await fetchMlEvidence());
      setPredictedDemand(await fetchPredictedBlockDemand());

      const c = await fetchTimeSpaceGraph();
      setCanvasData(c);

      const d = await fetchDispatchPreview();
      setDispatchPayload(d);
    }
    loadBackend();
  }, []);

  const handleRunSolver = async (method = selectedMethod, horizon = selectedHorizon) => {
    setIsSolving(true);
    try {
      let p;
      if (horizon === "monthly") {
        p = await fetchMonthlyPlan();
      } else if (horizon === "replan") {
        p = await fetchReplan("defect_burst", "SEC_0001");
      } else {
        p = await fetchWeeklyPlan(method);
      }
      setWeeklyPlan(p);
      const c = await fetchTimeSpaceGraph();
      setCanvasData(c);
      const a = await fetchArchitecture();
      setArchData(a);
      const comp = await fetchComparison();
      setComparisonData(comp);
      setMlEvidence(await fetchMlEvidence());

      const newLog = {
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        user: "CRIS Planner Agent",
        action: `SOLVER_RUN_${method.toUpperCase()}_${horizon.toUpperCase()}`,
        details: `Re-ran engine with method '${method}' on horizon '${horizon}'`,
        sha256: "client-demo-event"
      };
      setAuditLogs(prev => [newLog, ...prev]);
    } catch (err) {
      console.error("Solver execution error:", err);
    } finally {
      setIsSolving(false);
    }
  };

  const handleFreezeCheck = async (task) => {
    const taskId = task.task_id || task.defect_id || "BLK_001";
    const startTime = task.start_time || new Date().toISOString();
    const dri = task.risk_score || task.priority_score ? Math.min(0.95, (task.priority_score || 8) / 10) : 0.88;
    const result = await checkFreezeLock(taskId, startTime, dri);
    setFreezeModal(result);
  };

  const handleStageSelect = (stageId) => {
    setActiveStage(stageId);
    // Map stage to tab view for seamless walkthrough
    if (stageId === 1) setActiveTab("overview");
    else if (stageId === 2) setActiveTab("overview");
    else if (stageId === 3) setActiveTab("architecture");
    else if (stageId === 4) setActiveTab("overview");
    else if (stageId === 5) setActiveTab("explainable");
    else if (stageId === 6) setActiveTab("calendar");
    else if (stageId === 7) setActiveTab("alerts");
    else if (stageId === 8) setActiveTab("emergency");
    else if (stageId === 9) setActiveTab("bdms_audit");
    else if (stageId === 10) setActiveTab("execution");
  };

  const handleEmergencyLogged = (entry) => {
    setAuditLogs(prev => [entry, ...prev]);
  };

  return (
    <>
      {/* ============================================================
          HEADER — Fixed top: Topbar + Main Header + Nav + Ticker
          ============================================================ */}
      <header className="fixed top-0 left-0 w-full z-50 shadow-[0_1px_8px_rgba(0,0,0,0.08)] bg-surface-container-lowest">
        {/* — Government Identity Topbar — */}
        <div className="bg-primary text-on-primary h-topbar-h w-full">
          <div className="max-w-container-max mx-auto px-gutter-lg h-full flex items-center justify-between font-label-sm text-label-sm">
            <div className="flex items-center gap-gutter-md">
              <span className="tracking-wider opacity-90">भारत सरकार | GOVERNMENT OF INDIA</span>
              <span className="opacity-40">•</span>
              <span className="tracking-wider opacity-90">रेल मंत्रालय | MINISTRY OF RAILWAYS</span>
            </div>
            <div className="flex items-center gap-gutter-lg">
              <a className="opacity-80 hover:opacity-100 underline decoration-outline-variant hover:text-on-primary" href="#main-content">
                मुख्य सामग्री पर जाएं / Skip to Main Content
              </a>
              <div className="flex items-center gap-1 font-bold tracking-wide">
                <span className="text-secondary-fixed-dim">English</span>
                <span className="opacity-40">|</span>
                <span className="opacity-80 hover:opacity-100 cursor-pointer hover:text-on-primary">हिन्दी</span>
              </div>
            </div>
          </div>
        </div>

        {/* — Main Header Bar — */}
        <div className="h-header-main-h w-full bg-surface-container-lowest border-b-2 border-secondary-container">
          <div className="max-w-container-max mx-auto px-gutter-lg h-full flex items-center justify-between">
            <div className="flex items-center gap-gutter-lg">
              <div className="w-12 h-14 flex flex-col items-center justify-center border-r border-outline-variant pr-gutter-md">
                <span className="material-symbols-outlined text-primary text-3xl">account_balance</span>
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter text-center">सत्यमेव जयते</span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm font-bold text-primary tracking-tight">भारतीय रेल • INDIAN RAILWAYS</span>
                <span className="font-label-md text-label-md text-on-surface-variant font-medium">BANDHAN — Automatic Block Planning &amp; Engineering Possession Portal</span>
                <span className="font-label-sm text-label-sm text-secondary tracking-wide uppercase">Centre for Railway Information Systems (CRIS)</span>
              </div>
            </div>
            <div className="flex items-center gap-gutter-lg">
              <div className="bg-error-container text-on-error-container px-gutter-md py-gutter-xs rounded flex items-center gap-gutter-sm shadow-sm">
                <span className="material-symbols-outlined text-error text-xl">phone_in_talk</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase font-bold text-error">RailMadad Helpline</span>
                  <span className="font-headline-sm text-headline-sm font-bold leading-none">139</span>
                </div>
              </div>
              <div className="hidden lg:flex flex-col text-right border-l border-outline-variant pl-gutter-md">
                <span className="font-label-sm text-label-sm font-bold text-primary uppercase">Control Room Desk</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Block Clearance Center</span>
                <span className="font-label-sm text-label-sm text-tertiary-container font-semibold">RDSO GIGW 3.0 Met</span>
              </div>
            </div>
          </div>
        </div>

        {/* — Navigation Bar — */}
        <nav className="bg-primary-container h-nav-bar-h w-full shadow-md overflow-x-auto">
          <div className="max-w-container-max mx-auto px-gutter-lg h-full flex items-center justify-between">
            <div className="flex items-center h-full space-x-1 font-label-md text-label-md whitespace-nowrap">
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "live_portal" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("live_portal")}
                aria-current={activeTab === "live_portal" ? "page" : undefined}
              >
                <span className="mr-1.5 w-2 h-2 rounded-full bg-error animate-pulse"></span>
                Live Portal Mode
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "evidence" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("evidence")}
              >
                ML Evidence
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "overview" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("overview")}
              >
                Control Room
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "calendar" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("calendar")}
              >
                Calendar
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "replanning" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("replanning")}
              >
                Live Replanning
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "emergency" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("emergency")}
              >
                Emergency DRI
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "execution" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("execution")}
              >
                Execution Monitor
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "corridor_map" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("corridor_map")}
              >
                Corridor Map
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "explainable" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("explainable")}
              >
                AI Inspector
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "benchmark" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("benchmark")}
              >
                Baseline &amp; KPIs
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "whatif" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("whatif")}
              >
                What-If Simulator
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "alerts" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("alerts")}
              >
                Alerts
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "bdms_audit" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("bdms_audit")}
              >
                BDMS &amp; Audit
              </button>
              <button
                className={`h-full flex items-center px-3 transition-colors ${activeTab === "architecture" ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}
                onClick={() => setActiveTab("architecture")}
              >
                5-Layer Canvas
              </button>
            </div>
            <div className="flex items-center gap-gutter-sm text-on-primary font-label-sm text-label-sm bg-primary px-gutter-md py-1 rounded flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-secondary-container animate-ping"></span>
              <span className="tracking-wider uppercase font-bold text-secondary-fixed">
                {healthData?.status === "healthy" ? "CRIS BANDHAN Live" : "CRIS Local Mode"}
              </span>
            </div>
          </div>
        </nav>

        {/* — Live Ticker — */}
        <div className="bg-surface-container-high border-b border-outline-variant text-on-surface h-8 flex items-center overflow-hidden">
          <div className="max-w-container-max mx-auto px-gutter-lg w-full flex items-center">
            <div className="bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold uppercase px-gutter-sm py-0.5 rounded mr-gutter-md flex-shrink-0 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">campaign</span>
              <span>LIVE TICKER</span>
            </div>
            <div className="overflow-hidden whitespace-nowrap w-full text-body-sm font-body-sm text-on-surface-variant">
              <span className="inline-block animate-ticker">
                [BANDHAN v2.0] Synthetic evidence mode • Independent plan verification enabled • 24h freeze-window emergency gate active • Human approval required before dispatch
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================
          MAIN CONTENT
          ============================================================ */}
      <main className="w-full pt-[208px] bg-background min-h-screen" id="main-content">
        <div className="max-w-container-max mx-auto px-gutter-lg py-gutter-lg">
          <div className="flex flex-col w-full gap-gutter-lg">

            {/* — CLOSED-LOOP 10-STAGE STEPPER BAR — */}
            {activeTab !== "live_portal" && (
              <ClosedLoopStepper activeStage={activeStage} onStageSelect={handleStageSelect} />
            )}

            {/* — Quick Action Controls Bar — */}
            {activeTab !== "live_portal" && <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/20 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">tune</span>
                <div>
                  <h4 className="font-title-md text-title-md font-bold text-primary">BANDHAN Multi-Department Engine Controls</h4>
                  <p className="text-body-sm text-on-surface-variant">Switch solver heuristics, horizons or trigger auto-BDMS payload generation</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedHorizon}
                  onChange={(e) => {
                    setSelectedHorizon(e.target.value);
                    handleRunSolver(selectedMethod, e.target.value);
                  }}
                  className="bg-surface-container-high text-primary font-label-md text-label-md font-bold uppercase px-3 py-2 rounded-lg border border-outline-variant/40"
                >
                  <option value="weekly">7-Day Weekly Plan</option>
                  <option value="monthly">30-Day Monthly Plan</option>
                  <option value="replan">24h Disruption Lock</option>
                </select>

                <select
                  value={selectedMethod}
                  onChange={(e) => {
                    setSelectedMethod(e.target.value);
                    handleRunSolver(e.target.value, selectedHorizon);
                  }}
                  className="bg-primary text-on-primary font-label-md text-label-md font-bold uppercase px-3 py-2 rounded-lg"
                >
                  <option value="optimized">BANDHAN CP-SAT/ALNS</option>
                  <option value="greedy_smart">M1-M4 Smart Heuristic</option>
                  <option value="baseline">Naive Severity Baseline</option>
                </select>

                <button
                  className="bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-bold uppercase px-4 py-2 rounded-lg flex items-center gap-2 shadow"
                  onClick={() => setShowBdmsModal(true)}
                >
                  <span className="material-symbols-outlined text-lg">post_add</span>
                  <span>Auto-BDMS Signed Payload</span>
                </button>

                <button
                  disabled={isSolving}
                  className="bg-secondary hover:bg-on-secondary-container text-on-secondary font-label-md text-label-md font-bold uppercase px-4 py-2 rounded-lg flex items-center gap-2 shadow"
                  onClick={() => handleRunSolver(selectedMethod, selectedHorizon)}
                >
                  <span className="material-symbols-outlined text-lg">{isSolving ? "sync" : "bolt"}</span>
                  <span>{isSolving ? "Solving..." : "Re-Run Optimization"}</span>
                </button>
              </div>
            </div>}

            {/* — TAB CONTENT SWITCHER — */}
            {activeTab === "live_portal" && (
              <LivePortalMode weeklyPlan={weeklyPlan} />
            )}

            {activeTab === "overview" && (
              <ControlRoomOverview
                weeklyPlan={weeklyPlan}
                taskList={taskList}
                archData={archData}
                healthData={healthData}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === "calendar" && <CalendarView weeklyPlan={weeklyPlan} />}

            {activeTab === "replanning" && <ReplanningCenter weeklyPlan={weeklyPlan} onReplan={handleRunSolver} />}

            {activeTab === "emergency" && <EmergencyWorkflow onEmergencySubmit={handleEmergencyLogged} />}

            {activeTab === "execution" && <ExecutionMonitor weeklyPlan={weeklyPlan} />}

            {activeTab === "corridor_map" && <CorridorMap weeklyPlan={weeklyPlan} taskList={taskList} />}

            {activeTab === "explainable" && <ExplainableScheduleInspector taskList={taskList} weeklyPlan={weeklyPlan} />}

            {activeTab === "benchmark" && <BenchmarkComparison comparisonData={comparisonData} />}

            {activeTab === "whatif" && <WhatIfSimulator weeklyPlan={weeklyPlan} />}

            {activeTab === "alerts" && <ConflictAlertCenter weeklyPlan={weeklyPlan} />}

            {activeTab === "bdms_audit" && (
              <div className="space-y-6">
                <BdmsLifecycleTracker weeklyPlan={weeklyPlan} />
                <AuditTrail logs={auditLogs} />
              </div>
            )}

            {activeTab === "architecture" && (
              <div className="space-y-6">
                <ArchitectureGraph archData={archData} />
                <TimeSpaceCanvas canvasData={canvasData} />
              </div>
            )}

            {activeTab === "evidence" && <MlEvidencePanel evidence={mlEvidence} demand={predictedDemand} />}

          </div>
        </div>
      </main>

      {/* Freeze Lock Validation Modal */}
      {freezeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest p-6 rounded-xl max-w-md w-full shadow-2xl border border-primary/20">
            <h3 className="font-headline-sm text-headline-sm font-bold text-primary mb-2">24h Freeze Window Lock Status</h3>
            <p className="text-body-sm text-on-surface-variant mb-4">{freezeModal.reason}</p>
            <div className="space-y-2 text-label-md font-label-md bg-surface-container-low p-3 rounded-lg border border-outline-variant/30">
              <div>Task ID: <strong>{freezeModal.task_id}</strong></div>
              <div>Inside Freeze Window: <strong>{freezeModal.inside_freeze_window ? "YES (Locked)" : "NO"}</strong></div>
              <div>Dynamic Risk Index (DRI): <strong>{freezeModal.dynamic_risk_index}</strong></div>
              <div>Emergency Override Gate: <strong className={freezeModal.override_granted ? "text-on-tertiary-container" : "text-error"}>{freezeModal.override_granted ? "GRANTED (DRI >= 0.85)" : "BLOCKED (DRI < 0.85)"}</strong></div>
            </div>
            <button className="mt-4 w-full bg-primary text-on-primary py-2.5 rounded font-bold uppercase shadow" onClick={() => setFreezeModal(null)}>Close Window</button>
          </div>
        </div>
      )}

      {/* Auto-BDMS Modal */}
      {showBdmsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest p-6 rounded-xl max-w-2xl w-full shadow-2xl border border-primary/20 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline-sm text-headline-sm font-bold text-primary">BDMS Signed Possession Payload Preview</h3>
              <span className="bg-primary text-on-primary text-xs font-mono font-bold px-2.5 py-1 rounded">Idempotent SHA-256</span>
            </div>
            {dispatchPayload ? (
              <pre className="bg-primary text-on-primary p-4 rounded-lg text-xs font-mono overflow-x-auto shadow-inner">
                {JSON.stringify(dispatchPayload, null, 2)}
              </pre>
            ) : (
              <div className="bg-surface-container-low border border-secondary/30 text-on-surface-variant p-4 rounded-lg text-sm">
                Dispatch preview is unavailable because the BANDHAN backend is offline. Start the API service and reopen this preview.
              </div>
            )}
            <button className="mt-4 w-full bg-primary text-on-primary py-2.5 rounded font-bold uppercase shadow" onClick={() => setShowBdmsModal(false)}>Close Modal</button>
          </div>
        </div>
      )}

      {/* ============================================================
          FOOTER
          ============================================================ */}
      <footer className="w-full bg-primary text-on-primary border-t-4 border-secondary-container mt-gutter-xl">
        <div className="max-w-container-max mx-auto px-gutter-lg py-gutter-xl">
          <p className="text-center font-body-sm text-body-sm text-on-primary-container">
            © 2026 Ministry of Railways, Govt of India. Powered by CRIS &amp; BANDHAN Automatic Block Allocation Engine.
          </p>
        </div>
      </footer>
    </>
  );
}
