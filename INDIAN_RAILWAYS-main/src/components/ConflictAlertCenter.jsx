import React from 'react';

export default function ConflictAlertCenter() {
  const alerts = [
    { id: "ALT_001", type: "CRITICAL", title: "USFD Transverse Fatigue Defect", section: "SEC_0001 (KM 124/8)", time: "Immediate", desc: "Clamped at 30 KMPH. Rail piece renewal assigned to Gang 04.", action: "Resolved via Night Window" },
    { id: "ALT_002", type: "WARNING", title: "Crew Fleet Bottleneck", section: "SEC_0002", time: "14:00 - 18:00 IST", desc: "TRD Tower Wagon TW-02 crew exceeds 3-gang daily limit.", action: "Shifted to Window 02" },
    { id: "ALT_003", type: "INFO", title: "Freight Train Surge Forecast", section: "SEC_0003", time: "22:00 IST", desc: "FOIS forecast predicts +40% goods train surge in night corridor.", action: "Slotted in Natural Gap" }
  ];

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-gutter-md mb-gutter-md">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Conflict &amp; Safety Alert Center</h2>
            <span className="bg-error text-on-error font-label-sm text-label-sm px-2.5 py-0.5 rounded font-bold uppercase">
              Control Room Safety Watch
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Real-time conflict detection: infeasible block requests, train occupation overlaps, crew availability bottlenecks, and expiring deadlines
          </p>
        </div>
      </div>

      <div className="space-y-3 font-body-sm">
        {alerts.map((alt) => (
          <div key={alt.id} className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex items-start justify-between">
            <div className="flex items-start gap-3">
              <span className={`material-symbols-outlined text-2xl ${alt.type === "CRITICAL" ? "text-error" : "text-secondary"}`}>
                {alt.type === "CRITICAL" ? "warning" : "info"}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary text-title-lg">{alt.title}</span>
                  <span className="text-xs text-outline">[{alt.id}]</span>
                </div>
                <span className="text-on-surface-variant block font-medium mt-0.5">{alt.section} • {alt.time}</span>
                <p className="text-on-surface text-body-sm mt-1">{alt.desc}</p>
              </div>
            </div>
            <span className="bg-primary text-on-primary text-xs font-bold px-3 py-1 rounded uppercase">
              {alt.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
