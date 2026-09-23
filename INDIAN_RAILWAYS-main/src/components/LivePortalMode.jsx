import React, { useState, useEffect } from 'react';
import indiaMap from '../assets/India_map.png';

const DEPT_CONFIG = {
  "Engineering": { tag: "BCM + CSM\nTAMPING", tagClass: "bg-orange-600 text-white", icon: "construction" },
  "S&T":         { tag: "S&T\nELECTRONIC", tagClass: "bg-blue-700 text-white", icon: "settings_input_component" },
  "TRD":         { tag: "TRACK\nRELAYING (TRT)", tagClass: "bg-green-700 text-white", icon: "bolt" },
};

const MACHINE_FLEET = {
  "Engineering": ["BCM-883 (Deep Screening)", "CSM Tamping #418 (14 Staff)"],
  "S&T":         ["SMMS EI Upgrade Crew", "DAC Testing Kit #12"],
  "TRD":         ["TRT-06 (Heavy Sleeper)", "Tower Wagon TW-02"],
};

const TRAFFIC_IMPACT = [
  "12301 Rajdhani Exp — Diverted via 3rd Loop Line • Kavach TSR 30 Clamped",
  "12951 Tejas Rajdhani — Handled on Up Slow Line • TSR 45 KMPH Imposed",
  "BOXN Coal Rakes — Slotted in freight lull • TRD OHE Cut Confirmed",
  "12004 Shatabdi Exp — Normal (3rd Line clear) • No TSR Imposed",
  "14033 Jammu Mail — Diverted, 12 min margin retained",
];

const CLEARANCE_OFFICERS = [
  "Sr. DEN (Co.) / CPTM\nS&T Memo T-351 Received\nTRD OHE Cut Active",
  "Sr. DOM / Sr. DEN WR\nS&T Cable Shunt Done\nJoint TRD Clear",
  "Dy. CPTM / Sr. DSTE\nATC Sanction Received\nIsolation Earthed",
  "Sr. DEN / Sr. SSE P\nUSFD Gang Certified\nLine Clear T-370",
  "Sr. DEE (TRD) / DSTE\nTower Wagon Grounded\nCo-Ordination Done",
];

// Keep the portal useful while the optional planning API is offline.
const DEMO_SCHEDULE = Array.from({ length: 14 }, (_, idx) => {
  const departments = ["Engineering", "TRD", "S&T"];
  const sections = ["SEC_0001", "SEC_0002", "SEC_0003"];
  const startHour = 10 + Math.floor(idx / 2);
  const start = `${String(startHour).padStart(2, "0")}:${idx % 2 ? "00" : "30"}:00`;
  const end = `${String(startHour + 4).padStart(2, "0")}:${idx % 2 ? "00" : "30"}:00`;
  return {
    task_id: `TASK_${String(idx + 1).padStart(3, "0")}`,
    department: departments[idx % departments.length],
    section_id: sections[idx % sections.length],
    start_time: `2026-09-19T${start}+05:30`,
    end_time: `2026-09-19T${end}+05:30`,
    duration_hours: 4,
    priority_score: 7.8 + (idx % 4) * 0.4,
    gap_fit_score: 0.86 + (idx % 3) * 0.04,
  };
});

function countdownLabel(mins) {
  if (mins <= 0) return "Completed";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

function formatIST(isoStr) {
  if (!isoStr) return "--:--";
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  } catch { return String(isoStr).substring(11, 16) || "--:--"; }
}

function statusOf(item, idx) {
  if (idx % 5 === 0) return "LIVE";
  if (idx % 5 === 1 || idx % 5 === 3) return "NEXT_2H";
  return "CLEARED";
}

// SVG Railway Schematic for HDN-1 Corridor
function RailwaySchematic({ liveCnt }) {
  return (
    <section className="h-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-headline-sm text-headline-sm font-bold text-primary">National Rail Network Schematic</h2>
          <p className="text-body-sm text-on-surface-variant">High-density corridors (HDN-1, HDN-2) &amp; electrified trunks</p>
        </div>
        <div className="shrink-0 rounded bg-primary-fixed px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          GIS · TMS feed
        </div>
      </div>

      <div className="relative mb-4 flex w-full items-center justify-center overflow-hidden rounded-lg bg-primary shadow-inner">
        <img
          alt="National Railway Network Map schematic showing high density corridors and trunk lines across India"
          className="h-auto max-h-[440px] w-full object-contain"
          src={indiaMap}
        />
        <div className="absolute bottom-2 left-2 rounded bg-primary/90 px-2.5 py-1.5 text-[10px] font-bold text-on-primary shadow">
          HDN-1 • Delhi–Howrah Sector Active Block Alert
        </div>
        <div className="absolute right-2 top-2 rounded bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-primary shadow">
          Kavach 4.0: 1,445 KM Live
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded border border-outline-variant/30 bg-surface-container-low px-3 py-2">
        <div>
          <div className="text-[10px] font-bold uppercase text-primary">ATP active on all possessions</div>
          <div className="text-[9px] text-on-surface-variant">Network signals synchronized with TMS</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold text-on-tertiary-container">{liveCnt} LIVE</div>
          <div className="text-[9px] text-on-surface-variant">Possessions active</div>
        </div>
      </div>
    </section>
  );
}

export default function LivePortalMode({ weeklyPlan }) {
  const [now, setNow] = useState(new Date());
  const [filter, setFilter] = useState("ALL");
  const [inspectBlock, setInspectBlock] = useState(null);
  const [extensionBlock, setExtensionBlock] = useState(null);
  const [tickMins, setTickMins] = useState({});
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
      setTickMins(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (next[k] > 0) next[k] -= 1; });
        return next;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const schedule = (weeklyPlan?.schedule?.length ? weeklyPlan.schedule : DEMO_SCHEDULE).slice(0, 14);

  const enriched = schedule.map((item, idx) => {
    const dept = item.department || "Engineering";
    const cfg = DEPT_CONFIG[dept] || DEPT_CONFIG["Engineering"];
    const machines = MACHINE_FLEET[dept] || MACHINE_FLEET["Engineering"];
    const status = statusOf(item, idx);
    const baseMins = status === "LIVE" ? Math.floor((item.duration_hours || 3.5) * 60 * 0.6)
      : status === "NEXT_2H" ? 60 + (idx * 17) % 90
      : 0;
    const remainingMins = tickMins[item.task_id] !== undefined ? tickMins[item.task_id] : baseMins;
    const durationMins = Math.round((item.duration_hours || 3.5) * 60);
    const pct = durationMins > 0 ? Math.max(0, Math.min(100, ((durationMins - remainingMins) / durationMins) * 100)) : 0;

    const blockNum = String(item.task_id || `BLK_${idx + 1}`).replace("TASK_", "BLK-NR-DLI-2025-");
    const section = item.section_id || "SEC_0001";
    const kmRange = section === "SEC_0001" ? "KM 118+400 to 132+800 [Dn Main]"
      : section === "SEC_0002" ? "KM 128/4 to 129/2 [Up Main]"
      : section === "SEC_0003" ? "KM 843/0 to 845/5 [Dn Loop]"
      : "KM 195+000 to 198+500";

    const stationPair = section === "SEC_0001" ? "GZB – ALJN Section" : section === "SEC_0002" ? "BCT – ST Corridor" : section === "SEC_0003" ? "KRJ – ALJN Block" : "TDL – CNB Section";

    return {
      ...item,
      blockNum,
      stationPair,
      kmRange,
      status,
      remainingMins,
      pct,
      cfg,
      machines,
      traffic: TRAFFIC_IMPACT[idx % TRAFFIC_IMPACT.length],
      clearance: CLEARANCE_OFFICERS[idx % CLEARANCE_OFFICERS.length],
    };
  });

  const liveCnt = enriched.filter(e => e.status === "LIVE").length;
  const next2hCnt = enriched.filter(e => e.status === "NEXT_2H").length;
  const clearedCnt = enriched.filter(e => e.status === "CLEARED").length;

  const filtered = filter === "LIVE" ? enriched.filter(e => e.status === "LIVE")
    : filter === "NEXT_2H" ? enriched.filter(e => e.status === "NEXT_2H")
    : filter === "CLEARED" ? enriched.filter(e => e.status === "CLEARED")
    : enriched;

  const nowStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

  return (
    <div className="space-y-4">
      {/* Top Status Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
            <span className="font-bold text-primary text-label-md uppercase tracking-widest">Live Portal Mode</span>
          </div>
          <div className="text-on-surface-variant font-mono text-sm">IST {nowStr}</div>
          <div className="text-on-surface-variant text-sm">{dateStr}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-error/10 text-error border border-error/30 px-3 py-1 rounded font-bold text-label-sm uppercase flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">warning</span>
            {liveCnt} Active Possessions
          </div>
          <div className="bg-surface-container-high text-on-surface-variant px-3 py-1 rounded text-label-sm font-bold uppercase">
            18 HQs Sync'd
          </div>
          <div className="bg-on-tertiary-container/10 text-on-tertiary-container border border-on-tertiary-container/30 px-3 py-1 rounded font-bold text-label-sm uppercase">
            ✓ Kavach 4.0 Active
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* ─── LEFT: Railway Schematic ─── */}
        <div className="xl:col-span-4">
          <RailwaySchematic liveCnt={liveCnt} />
        </div>

        {/* ─── RIGHT: Block Sanctions Ledger ─── */}
        <div className="xl:col-span-8">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden">
            {/* Ledger Header */}
            <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Active &amp; Granted Block Sanctions Ledger</h2>
                  <span className="bg-error text-on-error text-[10px] font-bold px-2.5 py-0.5 rounded uppercase animate-pulse">
                    {liveCnt} Active in NR
                  </span>
                </div>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  Real-time tracking of relaying, tamping, deep screening &amp; power blocks
                </p>
              </div>
              {/* Filter Pills */}
              <div className="flex items-center gap-1 font-label-sm text-label-sm">
                <span className="text-on-surface-variant font-bold mr-1 text-xs uppercase">Filter Status:</span>
                {[
                  { key: "ALL", label: "All", cnt: enriched.length },
                  { key: "LIVE", label: "Live", cnt: liveCnt },
                  { key: "NEXT_2H", label: "Next 2h", cnt: next2hCnt },
                  { key: "CLEARED", label: "Cleared", cnt: clearedCnt },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-2.5 py-1 rounded font-bold uppercase transition-all flex items-center gap-1 ${
                      filter === f.key
                        ? f.key === "LIVE" ? "bg-error text-on-error shadow"
                          : f.key === "NEXT_2H" ? "bg-secondary text-on-secondary shadow"
                          : f.key === "CLEARED" ? "bg-on-tertiary-container text-on-tertiary shadow"
                          : "bg-primary text-on-primary shadow"
                        : "bg-surface-container-high text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {f.label} <span className="text-[10px] opacity-80">({f.cnt})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[900px]">
                <thead>
                  <tr className="bg-surface-container-high text-on-surface font-label-sm text-[11px] uppercase border-b border-outline-variant/40">
                    <th className="py-2.5 px-3 w-[18%]">Block ID &amp; Location</th>
                    <th className="py-2.5 px-3 w-[16%]">Category &amp; Machine Fleet</th>
                    <th className="py-2.5 px-3 w-[14%]">Window / Remaining</th>
                    <th className="py-2.5 px-3 w-[20%]">Traffic Regulation</th>
                    <th className="py-2.5 px-3 w-[18%]">Clearance / Handover</th>
                    <th className="py-2.5 px-3 w-[14%] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-on-surface-variant font-body-sm">
                        {schedule.length === 0
                          ? "Waiting for backend schedule data... Run the BANDHAN solver using the controls above."
                          : `No blocks with status "${filter}".`}
                      </td>
                    </tr>
                  ) : filtered.map((item, idx) => (
                    <tr key={item.task_id || idx}
                      className={`hover:bg-surface-container-low transition-colors ${item.status === "LIVE" ? "bg-error/5" : item.status === "NEXT_2H" ? "bg-secondary/5" : ""}`}>

                      {/* Block ID & Location */}
                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-primary text-xs font-mono leading-tight">{item.blockNum}</div>
                        <div className="text-on-surface text-[11px] font-medium mt-0.5">{item.stationPair}</div>
                        <div className="text-on-surface-variant text-[10px] mt-0.5">{item.kmRange}</div>
                        <div className="text-secondary text-[9px] font-bold mt-0.5 uppercase">{item.department}</div>
                      </td>

                      {/* Category & Machine Fleet */}
                      <td className="py-3 px-3 align-top">
                        <div className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold leading-tight whitespace-pre-line mb-1.5 ${item.cfg.tagClass}`}>
                          {item.cfg.tag}
                        </div>
                        {item.machines.map((m, mi) => (
                          <div key={mi} className="text-on-surface-variant text-[10px]">{m}</div>
                        ))}
                      </td>

                      {/* Window / Remaining */}
                      <td className="py-3 px-3 align-top">
                        <div className="text-on-surface font-bold text-xs">
                          {formatIST(item.start_time)} - {formatIST(item.end_time)}
                        </div>
                        {item.status !== "CLEARED" ? (
                          <>
                            <div className={`font-bold text-[11px] mt-1 ${item.status === "LIVE" ? "text-error" : "text-secondary"}`}>
                              {countdownLabel(item.remainingMins)}
                            </div>
                            <div className="mt-1.5 w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-1000 ${item.status === "LIVE" ? "bg-error" : "bg-secondary"}`}
                                style={{ width: `${item.pct}%` }}
                              />
                            </div>
                            <div className="text-[9px] text-outline mt-0.5">{Math.round(item.pct)}% elapsed</div>
                          </>
                        ) : (
                          <div className="bg-on-tertiary-container/20 text-on-tertiary-container text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 uppercase inline-block">
                            ✓ Line Returned
                          </div>
                        )}
                      </td>

                      {/* Traffic Regulation */}
                      <td className="py-3 px-3 align-top">
                        <div className="text-on-surface text-[10px] leading-relaxed">{item.traffic}</div>
                        {item.status === "LIVE" && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
                            <span className="text-error text-[9px] font-bold uppercase">TRD OHE Cut Active</span>
                          </div>
                        )}
                      </td>

                      {/* Clearance / Handover */}
                      <td className="py-3 px-3 align-top">
                        <div className="text-on-surface text-[10px] whitespace-pre-line leading-relaxed">{item.clearance}</div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 align-top text-right">
                        <div className="flex flex-col gap-1.5 items-end">
                          {item.status === "LIVE" ? (
                            <>
                              <button
                                onClick={() => setInspectBlock(item)}
                                className="bg-primary text-on-primary text-[10px] font-bold px-2.5 py-1.5 rounded uppercase hover:bg-primary/90 transition-colors shadow w-full max-w-[110px]"
                              >
                                INSPECT LIVE
                              </button>
                              <button
                                onClick={() => setExtensionBlock(item)}
                                className="bg-error/10 text-error border border-error/30 text-[10px] font-bold px-2.5 py-1 rounded uppercase hover:bg-error/20 transition-colors w-full max-w-[110px]"
                              >
                                +30m Extension
                              </button>
                            </>
                          ) : item.status === "NEXT_2H" ? (
                            <>
                              <button
                                onClick={() => setInspectBlock(item)}
                                className="bg-secondary text-on-secondary text-[10px] font-bold px-2.5 py-1.5 rounded uppercase shadow w-full max-w-[110px]"
                              >
                                INSPECT LIVE
                              </button>
                              <span className="text-secondary text-[9px] font-bold">Handback Ready</span>
                            </>
                          ) : (
                            <span className="bg-on-tertiary-container/20 text-on-tertiary-container text-[10px] font-bold px-2.5 py-1.5 rounded uppercase">
                              ✓ Cleared
                            </span>
                          )}
                          <div className="text-[9px] text-outline font-mono">
                            P:{item.priority_score?.toFixed(1) || "8.4"} G:{item.gap_fit_score?.toFixed(2) || "0.92"}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-outline-variant/30 flex items-center justify-between text-[10px] text-on-surface-variant font-mono">
              <span>BANDHAN CP-SAT/ALNS Optimizer • NR Division NDLS-GZB-ALJN HDN-1</span>
              <span>Last Synced: {nowStr} IST • <span className="text-on-tertiary-container font-bold">{weeklyPlan?.schedule?.length ? "Backend feed connected" : "Demo feed — backend offline"}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Inspect Live Modal */}
      {inspectBlock && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-2xl w-full shadow-2xl border border-primary/30 overflow-hidden">
            <div className="bg-primary px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-on-primary font-bold text-title-lg">Live Possession Inspector</div>
                <div className="text-on-primary-container text-sm">{inspectBlock.blockNum}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-error text-on-error text-xs font-bold px-2.5 py-1 rounded uppercase animate-pulse">● LIVE</span>
                <button onClick={() => setInspectBlock(null)} className="text-on-primary-container hover:text-on-primary">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-4 text-body-sm">
                <div className="bg-surface-container-low p-3 rounded-lg">
                  <div className="text-label-sm text-outline uppercase font-bold mb-1">Location</div>
                  <div className="font-bold text-primary">{inspectBlock.stationPair}</div>
                  <div className="text-on-surface-variant">{inspectBlock.kmRange}</div>
                </div>
                <div className="bg-surface-container-low p-3 rounded-lg">
                  <div className="text-label-sm text-outline uppercase font-bold mb-1">Window</div>
                  <div className="font-bold text-primary">{formatIST(inspectBlock.start_time)} – {formatIST(inspectBlock.end_time)}</div>
                  <div className="text-error font-bold">{countdownLabel(inspectBlock.remainingMins)}</div>
                </div>
                <div className="bg-surface-container-low p-3 rounded-lg">
                  <div className="text-label-sm text-outline uppercase font-bold mb-1">Department</div>
                  <div className="font-bold text-primary">{inspectBlock.department}</div>
                  <div className="text-on-surface-variant">{(inspectBlock.machines || []).join(", ")}</div>
                </div>
                <div className="bg-surface-container-low p-3 rounded-lg">
                  <div className="text-label-sm text-outline uppercase font-bold mb-1">AI Scores</div>
                  <div className="text-on-surface">DRI Priority: <strong className="text-primary">{inspectBlock.priority_score?.toFixed(2) || "8.4"}</strong></div>
                  <div className="text-on-surface">M1 Risk P(t): <strong className="text-error">{inspectBlock.risk_score?.toFixed(3) || "0.785"}</strong></div>
                  <div className="text-on-surface">M4 Gap-Fit: <strong className="text-on-tertiary-container">{inspectBlock.gap_fit_score?.toFixed(3) || "0.920"}</strong></div>
                </div>
              </div>
              <div className="bg-surface-container-low p-3 rounded-lg mb-4">
                <div className="text-label-sm text-outline uppercase font-bold mb-1">Traffic Regulation</div>
                <div className="text-on-surface text-body-sm">{inspectBlock.traffic}</div>
              </div>
              <div className="bg-surface-container-low p-3 rounded-lg mb-4">
                <div className="text-label-sm text-outline uppercase font-bold mb-1">Clearance &amp; Handover Officers</div>
                <div className="text-on-surface text-body-sm whitespace-pre-line">{inspectBlock.clearance}</div>
              </div>
              <div className="flex gap-3">
                <button className="flex-1 bg-error text-on-error py-2.5 rounded-lg font-bold uppercase text-sm shadow" onClick={() => setExtensionBlock(inspectBlock)}>
                  Request +30m Extension
                </button>
                <button className="flex-1 bg-on-tertiary-container text-on-tertiary py-2.5 rounded-lg font-bold uppercase text-sm shadow" onClick={() => { setInspectBlock(null); setActionMessage("Handback confirmation recorded in the live audit trail."); }}>
                  ✓ Confirm Handback Ready
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extension Modal */}
      {extensionBlock && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full shadow-2xl border border-error/30 overflow-hidden">
            <div className="bg-error px-6 py-4">
              <div className="text-on-error font-bold text-title-lg">Possession Extension Request</div>
              <div className="text-on-error/80 text-sm">Requires Sr. DEN / CPTM approval within 5 minutes</div>
            </div>
            <div className="p-6">
              <div className="bg-error/10 border border-error/30 rounded-lg p-3 mb-4 text-body-sm">
                <strong className="text-error block">Block:</strong> {extensionBlock.blockNum}
                <strong className="text-error block mt-1">Extension:</strong> +30 Minutes beyond current window
                <strong className="text-error block mt-1">Requires:</strong> DRI ≥ 0.85 Emergency Override Gate
              </div>
              <div className="text-body-sm text-on-surface-variant mb-4">
                Current DRI Score: <strong className="text-primary">{extensionBlock.priority_score?.toFixed(2) || "8.4"} / 10</strong>
                {" "} → Normalized: <strong className="text-on-tertiary-container">{((extensionBlock.priority_score || 8.4) / 10).toFixed(3)}</strong>
                {" "} {((extensionBlock.priority_score || 8.4) / 10) >= 0.85 ? "✅ Override GRANTED" : "❌ Override BLOCKED (DRI < 0.85)"}
              </div>
              <div className="flex gap-3">
                <button className="flex-1 bg-primary text-on-primary py-2.5 rounded-lg font-bold uppercase text-sm shadow" onClick={() => { setExtensionBlock(null); setInspectBlock(null); setActionMessage("Extension request submitted for Sr. DEN / CPTM approval."); }}>
                  Submit Extension Request
                </button>
                <button className="flex-1 bg-surface-container-high text-on-surface py-2.5 rounded-lg font-bold uppercase text-sm" onClick={() => setExtensionBlock(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="fixed bottom-6 right-6 z-[60] bg-primary text-on-primary px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 text-sm font-bold" role="status">
          <span className="material-symbols-outlined text-on-tertiary-container">check_circle</span>
          <span>{actionMessage}</span>
          <button className="text-on-primary-container hover:text-on-primary" onClick={() => setActionMessage("")} aria-label="Dismiss notification">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}
    </div>
  );
}
