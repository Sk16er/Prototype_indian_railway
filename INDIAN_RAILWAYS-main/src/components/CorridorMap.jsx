import React, { useState } from 'react';

const DEPT_COLOR = {
  "Engineering": "bg-orange-600 text-white",
  "S&T":         "bg-blue-700 text-white",
  "TRD":         "bg-green-700 text-white",
};

const STATIC_SECTIONS = [
  { id: "SEC_0001", name: "NDLS – GZB Main Line", from: "NDLS", to: "GZB", km: 24.8, tracks: 4 },
  { id: "SEC_0002", name: "GZB – Khurja HDN-1", from: "GZB", to: "KRJ", km: 42.1, tracks: 3 },
  { id: "SEC_0003", name: "Khurja – Aligarh Sector", from: "KRJ", to: "ALJN", km: 38.5, tracks: 2 },
  { id: "SEC_0004", name: "Aligarh – Tundla Trunk", from: "ALJN", to: "TDL", km: 65.0, tracks: 2 },
];

function formatTime(isoStr) {
  if (!isoStr) return "--:--";
  try { return String(isoStr).substring(11, 16); } catch { return "--:--"; }
}

export default function CorridorMap({ weeklyPlan, taskList }) {
  const [selectedSec, setSelectedSec] = useState(null);
  const schedule = weeklyPlan?.schedule || [];

  // Group schedule by section
  const bySection = {};
  STATIC_SECTIONS.forEach(s => { bySection[s.id] = []; });
  schedule.forEach(item => {
    const sid = item.section_id;
    if (bySection[sid]) bySection[sid].push(item);
  });

  // Compute section occupancy pct (total possession hours vs 24h per day * 7 days)
  const occupancyPct = (sid) => {
    const items = bySection[sid] || [];
    const totalH = items.reduce((s, i) => s + (i.duration_hours || 3.5), 0);
    return Math.min(100, Math.round((totalH / (24 * 7)) * 100 * 10)); // scale for visual
  };

  const sectionStatus = (sid) => {
    const items = bySection[sid] || [];
    if (items.length === 0) return { label: "Clear", color: "text-on-tertiary-container" };
    const hasTRD = items.some(i => i.department === "TRD");
    const hasST = items.some(i => i.department === "S&T");
    if (hasTRD && hasST) return { label: "25kV OHE + S&T Disconnection", color: "text-error" };
    if (hasTRD) return { label: "25kV OHE Isolated", color: "text-orange-500" };
    if (hasST) return { label: "S&T EI Work Active", color: "text-blue-500" };
    return { label: "Engineering Block", color: "text-secondary" };
  };

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-gutter-md mb-gutter-md">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Railway Corridor &amp; Infrastructure Section Schematic</h2>
            <span className="bg-primary text-on-primary font-label-sm text-label-sm px-2.5 py-0.5 rounded font-bold uppercase">
              GIS / TMS Layer
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Station-to-station corridor layout, track occupancy, fixed infrastructure assets &amp; active possession bounds
          </p>
        </div>
        <div className="text-label-sm text-outline font-bold">
          {schedule.length} possessions across {Object.keys(bySection).filter(s => bySection[s].length > 0).length} sections
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter-lg">
        {/* Schematic Canvas */}
        <div className="bg-primary rounded-xl p-4 min-h-[400px] flex flex-col">
          <div className="flex items-center justify-between border-b border-primary-container pb-2 mb-4">
            <span className="font-bold text-secondary-fixed text-label-md uppercase">NDLS–GZB–KRJ–ALJN–TDL Corridor Schematic</span>
            <span className="text-xs bg-primary-container text-on-primary-container px-2 py-0.5 rounded">HDN-1 Trunk • 25kV AC Electrified</span>
          </div>

          {/* Track lines visual */}
          <div className="flex-1 space-y-4">
            {STATIC_SECTIONS.map((sec, i) => {
              const items = bySection[sec.id] || [];
              const occ = occupancyPct(sec.id);
              const st = sectionStatus(sec.id);
              const isSelected = selectedSec === sec.id;
              return (
                <div key={sec.id}
                  onClick={() => setSelectedSec(isSelected ? null : sec.id)}
                  className={`rounded-lg p-3 cursor-pointer transition-all border ${isSelected ? "bg-secondary/20 border-secondary" : "bg-primary-container/30 border-primary-container/50"}`}>
                  <div className="flex items-center justify-between text-xs font-bold mb-2">
                    <span className="text-on-primary">{sec.from} ────── {sec.to}</span>
                    <span className="text-secondary-fixed">{sec.km} KM • {sec.tracks} lines</span>
                  </div>

                  {/* Multi-track lines */}
                  <div className="space-y-1 mb-2">
                    {Array.from({ length: Math.min(sec.tracks, 4) }, (_, ti) => {
                      const trackItems = items.filter((_, idx) => idx % sec.tracks === ti);
                      return (
                        <div key={ti} className="flex items-center gap-1">
                          <span className="text-[8px] text-on-primary-container w-14 flex-shrink-0">
                            {ti === 0 ? "Dn Main" : ti === 1 ? "Up Main" : ti === 2 ? "3rd Line" : "Loop"}
                          </span>
                          <div className="flex-1 bg-primary/50 h-2.5 rounded-full overflow-hidden relative">
                            {trackItems.map((item, ii) => {
                              const deptClass = item.department === "Engineering" ? "bg-orange-500" : item.department === "S&T" ? "bg-blue-500" : "bg-green-500";
                              const pct = Math.min(60, 15 + ii * 10);
                              return (
                                <div key={ii} className={`absolute h-full ${deptClass}`}
                                  style={{ left: `${(ii * 25) % 80}%`, width: `${pct}%` }} />
                              );
                            })}
                            {trackItems.length === 0 && <div className="h-full bg-on-tertiary-container/30 w-full" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${st.color}`}>{st.label}</span>
                    <span className="text-[10px] text-on-primary-container">{items.length} possession{items.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section Detail Panel */}
        <div className="space-y-3">
          <span className="font-label-md text-label-md font-bold text-primary uppercase block">
            {selectedSec ? `Section Detail: ${selectedSec}` : "Section Asset Readiness Inventory"}
          </span>

          {STATIC_SECTIONS.map(sec => {
            const items = bySection[sec.id] || [];
            const isSelected = selectedSec === sec.id;
            return (
              <div key={sec.id}
                onClick={() => setSelectedSec(isSelected ? null : sec.id)}
                className={`bg-surface-container-low p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? "border-primary bg-primary/5" : "border-outline-variant/30 hover:border-primary/30"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-bold text-primary block text-sm">{sec.id} — {sec.name}</span>
                    <span className="text-on-surface-variant text-xs">{sec.from} → {sec.to} • {sec.km} KM • {sec.tracks} Running Lines</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-label-sm px-2 py-0.5 rounded font-bold uppercase ${items.length > 0 ? "bg-error/10 text-error" : "bg-on-tertiary-container/10 text-on-tertiary-container"}`}>
                      {items.length > 0 ? `${items.length} Active` : "Clear"}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isSelected && items.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-outline-variant/30 pt-3">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-surface-container-lowest rounded p-2">
                        <span className={`${DEPT_COLOR[item.department] || "bg-primary text-on-primary"} px-1.5 py-0.5 rounded text-[9px] font-bold`}>
                          {item.department}
                        </span>
                        <span className="font-bold text-primary">{item.task_id}</span>
                        <span className="text-on-surface-variant">{formatTime(item.start_time)}–{formatTime(item.end_time)}</span>
                        <span className="text-secondary font-bold ml-auto">{(item.duration_hours || 3.5).toFixed(1)}h P90</span>
                      </div>
                    ))}
                  </div>
                )}

                {isSelected && items.length === 0 && (
                  <div className="mt-2 text-xs text-on-surface-variant">No possessions scheduled for this section. Section is clear for train operations.</div>
                )}

                <div className="flex items-center gap-2 mt-2 text-[10px] text-on-surface-variant">
                  <span>USFD Gangs: 2 assigned</span>
                  <span>•</span>
                  <span>25kV Isolators: Verified Earthed</span>
                  <span>•</span>
                  <span className={sectionStatus(sec.id).color + " font-bold"}>{sectionStatus(sec.id).label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
