import React from 'react';

export default function AuditTrail({ logs }) {
  const entries = logs && logs.length > 0 ? logs : [
    {
      timestamp: "2026-09-19 08:30:00",
      user: "System (Auto-BDMS)",
      action: "WEEKLY_SCHEDULE_GENERATED",
      details: "142 possessions optimized across 4 divisions (DLI, ALD, LKO, MB)",
      sha256: "e3b0c44298fc1c149afbf4c8996fb9242"
    },
    {
      timestamp: "2026-09-19 10:15:22",
      user: "Sr. DOM / Northern Railway",
      action: "BDMS_SUBMISSION_SANCTIONED",
      details: "Possession BLK_001 (NDLS-GZB 3rd Line) signed & submitted to CRIS ESB",
      sha256: "8f434346648f6b96df89dda901c5176b"
    },
    {
      timestamp: "2026-09-19 12:40:05",
      user: "Safety Officer / CRIS",
      action: "EMERGENCY_OVERRIDE_GRANTED",
      details: "DEFECT_9901 (IMR Flaw, DRI=0.92) granted 24h freeze window override",
      sha256: "1e2f3a4b5c6d7e8f90a1b2c3d4e5f6a7"
    }
  ];

  const actionColor = (action) => {
    if (action.includes("GRANTED") || action.includes("SUBMITTED") || action.includes("GENERATED")) return "bg-on-tertiary-container/20 text-on-tertiary-container border-on-tertiary-container/30";
    if (action.includes("BLOCKED") || action.includes("ERROR")) return "bg-error/10 text-error border-error/30";
    if (action.includes("SOLVER") || action.includes("BDMS")) return "bg-primary/10 text-primary border-primary/30";
    return "bg-surface-container-high text-on-surface border-outline-variant/30";
  };

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-gutter-md mb-gutter-md">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Control Room Audit Trail &amp; Regulatory Log</h2>
            <span className="bg-primary text-on-primary font-label-sm text-label-sm px-2.5 py-0.5 rounded font-bold uppercase">
              Immutable System Log
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Timestamped, SHA-256 fingerprinted record of every block allocation, 24h freeze override, and BDMS dispatch
          </p>
        </div>
        <div className="text-label-sm text-outline font-bold mt-2 md:mt-0">
          {entries.length} entries
        </div>
      </div>

      <div className="space-y-2 max-h-[480px] overflow-y-auto">
        {entries.map((log, idx) => (
          <div key={idx} className={`rounded-lg border p-3 flex items-start justify-between ${actionColor(log.action)}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs font-mono uppercase">{log.action}</span>
                <span className="text-[10px] text-outline font-mono">[{log.timestamp}]</span>
              </div>
              <p className="text-body-sm text-on-surface mt-1 leading-snug">{log.details}</p>
              <div className="text-[9px] text-outline font-mono mt-1 truncate">
                SHA-256: {log.sha256}
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-3">
              <span className="bg-surface-container-lowest text-on-surface px-2 py-0.5 rounded text-[10px] font-bold uppercase block mb-1 border border-outline-variant/30 max-w-[120px] text-right">
                {log.user}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
