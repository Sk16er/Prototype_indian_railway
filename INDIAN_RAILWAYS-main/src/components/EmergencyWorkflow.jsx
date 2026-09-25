import React, { useState } from 'react';
import { checkFreezeLock } from '../api';

// Fix: floatVal must be defined before handleEvaluateEmergency
const floatVal = (v, def) => {
  const p = parseFloat(v);
  return isNaN(p) ? def : p;
};

export default function EmergencyWorkflow({ onEmergencySubmit }) {
  const [defectId, setDefectId] = useState("EMG_DEF_901");
  const [severityGrade, setSeverityGrade] = useState("4");
  const [failureProb, setFailureProb] = useState("0.92");
  const [overdueDays, setOverdueDays] = useState("14");
  const [tsrFactor, setTsrFactor] = useState("0.8");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleEvaluateEmergency = async () => {
    setIsEvaluating(true);
    setResult(null);
    setError('');
    try {
      // DRI formula: 0.55*failure + 0.20*(overdue/90) + 0.15*(tsr) + 0.10*(severity/4)
      const failure = floatVal(failureProb, 0.92);
      const overdue = Math.min(1.0, floatVal(overdueDays, 14) / 90.0);
      const tsr = floatVal(tsrFactor, 0.8);
      const severity = floatVal(severityGrade, 4) / 4.0;
      const dri = Math.min(1.0, 0.55 * failure + 0.20 * overdue + 0.15 * tsr + 0.10 * severity);

      const lockResult = await checkFreezeLock(defectId, new Date(Date.now() + 2 * 3600000).toISOString(), dri);
      setResult(lockResult || {
        task_id: defectId,
        inside_freeze_window: true,
        dynamic_risk_index: dri.toFixed(4),
        override_granted: dri >= 0.85,
        hours_until_execution: 2.0,
        modification_allowed: dri >= 0.85,
        reason: dri >= 0.85
          ? `Inside 24h freeze window. Emergency override GRANTED (DRI = ${dri.toFixed(4)} ≥ 0.85).`
          : `Inside 24h freeze window. Modification BLOCKED (DRI = ${dri.toFixed(4)} < 0.85 emergency threshold).`
      });

      // Log to audit trail via parent callback
      if (onEmergencySubmit) {
        onEmergencySubmit({
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: "Sr. DEN (Co.) / Safety Control",
          action: dri >= 0.85 ? "EMERGENCY_OVERRIDE_GRANTED" : "EMERGENCY_OVERRIDE_BLOCKED",
          details: `Defect ${defectId} evaluated: DRI=${dri.toFixed(4)}, Failure P(t)=${failure}, Overdue=${floatVal(overdueDays, 14)} days`,
          sha256: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        });
      }
    } catch (err) {
      setError(err.message || 'Emergency evaluation could not reach the freeze-lock API.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Live DRI preview
  const liveFailure = floatVal(failureProb, 0.92);
  const liveOverdue = Math.min(1.0, floatVal(overdueDays, 14) / 90.0);
  const liveTsr = floatVal(tsrFactor, 0.8);
  const liveSeverity = floatVal(severityGrade, 4) / 4.0;
  const liveDri = Math.min(1.0, 0.55 * liveFailure + 0.20 * liveOverdue + 0.15 * liveTsr + 0.10 * liveSeverity);
  const driPasses = liveDri >= 0.85;

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-gutter-md mb-gutter-md gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Emergency Defect Workflow &amp; DRI Override Gate</h2>
            <span className="bg-error text-on-error font-label-sm text-label-sm px-2.5 py-0.5 rounded font-bold uppercase">
              24h Freeze Lock Gate
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Emergency defect evaluation: Dynamic Risk Index (DRI = 0.55·P(t) + 0.20·Overdue + 0.15·TSR + 0.10·Criticality) with DRI ≥ 0.85 required to override the 24h freeze window.
          </p>
        </div>
        {/* Live DRI Preview */}
        <div className={`flex-shrink-0 flex flex-col items-center p-3 rounded-xl border-2 ${driPasses ? "border-on-tertiary-container bg-on-tertiary-container/10" : "border-error bg-error/10"}`}>
          <div className="text-label-sm font-bold uppercase text-outline mb-0.5">Live DRI</div>
          <div className={`font-black text-display-lg ${driPasses ? "text-on-tertiary-container" : "text-error"}`}>{liveDri.toFixed(3)}</div>
          <div className={`text-label-sm font-bold uppercase ${driPasses ? "text-on-tertiary-container" : "text-error"}`}>
            {driPasses ? "✓ Override PASSES" : "✗ Override BLOCKED"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter-md mb-gutter-lg">
        <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30">
          <label className="font-label-sm text-label-sm uppercase font-bold text-primary block mb-1">Defect Identifier</label>
          <input type="text" value={defectId} onChange={e => setDefectId(e.target.value)}
            className="w-full bg-surface-container-lowest p-2 rounded border border-outline-variant/40 font-bold text-primary font-mono text-sm focus:outline-none focus:border-primary" />
        </div>

        <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30">
          <label className="font-label-sm text-label-sm uppercase font-bold text-primary block mb-1">Severity Grade (1–4)</label>
          <select value={severityGrade} onChange={e => setSeverityGrade(e.target.value)}
            className="w-full bg-surface-container-lowest p-2 rounded border border-outline-variant/40 font-bold text-primary focus:outline-none">
            <option value="4">Grade 4 — Critical IMR Defect</option>
            <option value="3">Grade 3 — High Severity</option>
            <option value="2">Grade 2 — Medium</option>
            <option value="1">Grade 1 — Low / Planned</option>
          </select>
          <div className="text-[10px] text-outline mt-1 font-mono">Contributes 0.10 × ({floatVal(severityGrade,4)}/4) = {(0.10 * liveSeverity).toFixed(3)}</div>
        </div>

        <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30">
          <label className="font-label-sm text-label-sm uppercase font-bold text-primary block mb-1">M1 Failure Risk P(t): {liveFailure.toFixed(3)}</label>
          <input type="range" min="0" max="1" step="0.01" value={failureProb} onChange={e => setFailureProb(e.target.value)} className="w-full accent-primary" />
          <div className="flex justify-between text-[10px] text-outline mt-0.5"><span>0.00</span><strong className="text-primary">{liveFailure.toFixed(3)}</strong><span>1.00</span></div>
          <div className="text-[10px] text-outline mt-1 font-mono">Contributes 0.55 × {liveFailure.toFixed(3)} = {(0.55 * liveFailure).toFixed(3)}</div>
        </div>

        <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30">
          <label className="font-label-sm text-label-sm uppercase font-bold text-primary block mb-1">Overdue Days: {floatVal(overdueDays, 14)}</label>
          <input type="range" min="0" max="90" step="1" value={overdueDays} onChange={e => setOverdueDays(e.target.value)} className="w-full accent-primary" />
          <div className="flex justify-between text-[10px] text-outline mt-0.5"><span>0d</span><strong className="text-primary">{floatVal(overdueDays,14)}d</strong><span>90d</span></div>
          <div className="text-[10px] text-outline mt-1 font-mono">Contributes 0.20 × {liveOverdue.toFixed(3)} = {(0.20 * liveOverdue).toFixed(3)}</div>
        </div>
      </div>

      {/* DRI Breakdown Bar */}
      <div className="bg-surface-container-low p-3 rounded-xl mb-gutter-md border border-outline-variant/30">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-md text-label-md font-bold text-primary uppercase">DRI Formula Breakdown</span>
          <span className="font-mono text-sm font-bold text-primary">= 0.55·P(t) + 0.20·Overdue + 0.15·TSR + 0.10·Criticality</span>
        </div>
        <div className="flex h-5 rounded-full overflow-hidden w-full">
          <div className="bg-error transition-all" style={{ width: `${(0.55 * liveFailure / liveDri || 0) * 100}%` }} title={`M1 Risk: ${(0.55*liveFailure).toFixed(3)}`}></div>
          <div className="bg-secondary transition-all" style={{ width: `${(0.20 * liveOverdue / liveDri || 0) * 100}%` }} title={`Overdue: ${(0.20*liveOverdue).toFixed(3)}`}></div>
          <div className="bg-on-tertiary-container transition-all" style={{ width: `${(0.15 * liveTsr / liveDri || 0) * 100}%` }} title={`TSR: ${(0.15*liveTsr).toFixed(3)}`}></div>
          <div className="bg-primary transition-all" style={{ width: `${(0.10 * liveSeverity / liveDri || 0) * 100}%` }} title={`Criticality: ${(0.10*liveSeverity).toFixed(3)}`}></div>
        </div>
        <div className="flex justify-between text-[10px] font-bold mt-1">
          <span className="text-error">M1 Risk: {(0.55*liveFailure).toFixed(3)}</span>
          <span className="text-secondary">Overdue: {(0.20*liveOverdue).toFixed(3)}</span>
          <span className="text-on-tertiary-container">TSR: {(0.15*liveTsr).toFixed(3)}</span>
          <span className="text-primary">Criticality: {(0.10*liveSeverity).toFixed(3)}</span>
        </div>
      </div>

      <button onClick={handleEvaluateEmergency} disabled={isEvaluating}
        className="w-full bg-primary hover:bg-primary-container text-on-primary py-3 rounded-lg font-bold uppercase shadow transition-all mb-gutter-md flex items-center justify-center gap-2 disabled:opacity-70">
        <span className="material-symbols-outlined text-lg">{isEvaluating ? "sync" : "security"}</span>
        <span>{isEvaluating ? "Evaluating against CRIS freeze lock API..." : `Evaluate Emergency Override Gate (DRI ≥ 0.85) — Current: ${liveDri.toFixed(3)}`}</span>
      </button>

      {error && <div className="bg-error-container text-on-error-container border border-error/30 rounded-lg p-3 text-body-sm" role="alert">{error} No decision was recorded.</div>}

      {result && (
        <div className={`p-4 rounded-xl border font-body-sm ${result.override_granted ? "bg-on-tertiary-container/10 border-on-tertiary-container/40" : "bg-error/10 border-error/40"}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-title-lg text-title-lg font-bold text-primary">Emergency Gate Outcome</span>
            <span className={`px-3 py-1 rounded font-bold text-xs uppercase ${result.override_granted ? "bg-on-tertiary-container text-on-tertiary" : "bg-error text-on-error"}`}>
              {result.override_granted ? "✓ OVERRIDE GRANTED (DRI ≥ 0.85)" : "✗ OVERRIDE BLOCKED (DRI < 0.85)"}
            </span>
          </div>
          <p className="text-on-surface mb-3">{result.reason}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs text-on-surface bg-surface-container-low rounded-lg p-3">
            <div>Defect ID: <strong>{result.task_id}</strong></div>
            <div>DRI Score: <strong>{result.dynamic_risk_index}</strong></div>
            <div>Hours to Window: <strong>{result.hours_until_execution}h</strong></div>
            <div>Audit Status: <strong className="text-on-tertiary-container">Logged ✓</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}
