import React, { useState } from 'react';

export default function TimeSpaceCanvas({ canvasData }) {
  const [selectedTrajectory, setSelectedTrajectory] = useState(null);

  const sections = canvasData?.network_sections || ["SEC_0001", "SEC_0002", "SEC_0003", "SEC_0004"];
  const trajectories = canvasData?.trajectories || [
    { train_id: "12301 Rajdhani", section_id: "SEC_0001", start_time: "2026-10-01T08:00:00", end_time: "2026-10-01T09:30:00", traffic_class: "scheduled", start_km: 0, end_km: 25 },
    { train_id: "12951 Tejas", section_id: "SEC_0002", start_time: "2026-10-01T10:00:00", end_time: "2026-10-01T11:15:00", traffic_class: "scheduled", start_km: 25, end_km: 60 },
    { train_id: "VIRTUAL_BLOCK_BLK_001", section_id: "SEC_0001", start_time: "2026-10-01T10:30:00", end_time: "2026-10-01T14:30:00", traffic_class: "virtual_maintenance_block", department: "Engineering", start_km: 5, end_km: 18 },
    { train_id: "VIRTUAL_BLOCK_BLK_002", section_id: "SEC_0002", start_time: "2026-10-01T11:00:00", end_time: "2026-10-01T15:30:00", traffic_class: "virtual_maintenance_block", department: "TRD", start_km: 30, end_km: 45 }
  ];

  const svgWidth = 800;
  const svgHeight = 400;

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-gutter-md mb-gutter-md">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-headline-sm text-headline-sm font-bold text-primary">WebGL / Interactive Time-Space Canvas</h3>
            <span className="bg-primary text-on-primary font-label-sm text-label-sm px-2 py-0.5 rounded font-bold uppercase">Luan et al. Virtual Train Model</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Real-time time-space trajectory strings for passenger/freight trains vs maintenance block possessions</p>
        </div>
        <div className="flex items-center gap-3 mt-2 md:mt-0 text-label-sm font-label-sm">
          <div className="flex items-center gap-1">
            <span className="w-3 h-1 bg-primary rounded-full"></span>
            <span className="text-on-surface">Scheduled Trains</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-secondary rounded"></span>
            <span className="text-on-surface font-bold">Virtual Maintenance Blocks</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Chart */}
      <div className="relative w-full overflow-x-auto bg-surface-container-low rounded-xl p-gutter-md border border-outline-variant/40">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto max-h-[460px]">
          {/* Grid lines */}
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <line key={`v-${i}`} x1={60 + i * 110} y1={20} x2={60 + i * 110} y2={350} stroke="#c3c6d1" strokeWidth="1" strokeDasharray="3 3" />
          ))}
          {[0, 1, 2, 3].map(i => (
            <line key={`h-${i}`} x1={60} y1={50 + i * 90} x2={720} y2={50 + i * 90} stroke="#c3c6d1" strokeWidth="1" />
          ))}

          {/* Time axis labels */}
          {["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"].map((t, idx) => (
            <text key={`t-${idx}`} x={60 + idx * 110} y={375} fontSize="11" fill="#43474f" textAnchor="middle" fontWeight="bold">{t}</text>
          ))}

          {/* Section labels */}
          {sections.map((sec, idx) => (
            <text key={`sec-${idx}`} x={45} y={60 + idx * 80} fontSize="10" fill="#001e40" textAnchor="end" fontWeight="bold">{sec}</text>
          ))}

          {/* Trajectories */}
          {trajectories.map((t, idx) => {
            const isBlock = t.traffic_class === "virtual_maintenance_block";
            const x1 = 80 + (idx * 130) % 550;
            const y1 = 50 + (idx % sections.length) * 75;
            const width = isBlock ? 140 : 100;

            return (
              <g key={`traj-${idx}`} className="cursor-pointer" onClick={() => setSelectedTrajectory(t)}>
                {isBlock ? (
                  <rect
                    x={x1}
                    y={y1 - 15}
                    width={width}
                    height={30}
                    rx={6}
                    fill={t.department === "TRD" ? "#fe9832" : "#003366"}
                    opacity="0.85"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                ) : (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x1 + width}
                    y2={y1 + 45}
                    stroke="#001e40"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                )}
                <text
                  x={x1 + width / 2}
                  y={y1 + 4}
                  fontSize="10"
                  fill="#ffffff"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {isBlock ? (t.department || "BLOCK") : t.train_id}
                </text>
              </g>
            );
          })}
        </svg>

        {selectedTrajectory && (
          <div className="mt-3 p-3 bg-surface-container-lowest rounded-lg border border-primary/40 flex items-center justify-between font-body-sm text-body-sm">
            <div>
              <span className="font-bold text-primary">Selected Entity: {selectedTrajectory.train_id}</span>
              <span className="ml-3 text-on-surface-variant">Section: {selectedTrajectory.section_id}</span>
              <span className="ml-3 text-secondary font-bold">Type: {selectedTrajectory.traffic_class}</span>
            </div>
            <button className="text-error font-bold hover:underline" onClick={() => setSelectedTrajectory(null)}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
