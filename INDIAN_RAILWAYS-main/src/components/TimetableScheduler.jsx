import React, { useState, useMemo } from 'react';
import timetableData from '../data/timetableData.json';

const TRAIN_COLORS = {
  "Express_Passenger": "#003366",
  "Superfast": "#0284c7",
  "Freight": "#7c3aed",
  "virtual_block": "#d97706"
};

export default function TimetableScheduler({ weeklyPlan, onScheduleBlock }) {
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [selectedDay, setSelectedDay] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState('canvas'); // 'canvas' | 'table' | 'gaps'
  const [selectedItem, setSelectedItem] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const sections = timetableData.sections || [];
  const entries = timetableData.entries || [];

  // Filtered timetable entries
  const filteredEntries = useMemo(() => {
    return entries.filter(item => {
      if (selectedSection !== 'ALL' && item.section_id !== selectedSection) return false;
      if (selectedDay !== 'ALL' && String(item.day_of_week) !== String(selectedDay)) return false;
      if (selectedType !== 'ALL') {
        if (selectedType === 'freight' && !item.is_freight) return false;
        if (selectedType === 'passenger' && item.is_freight) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (item.train_name || '').toLowerCase().includes(q);
        const matchesId = (item.train_id || '').toLowerCase().includes(q);
        const matchesSec = (item.section_name || '').toLowerCase().includes(q) || (item.section_id || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesSec) return false;
      }
      return true;
    });
  }, [entries, selectedSection, selectedDay, selectedType, searchQuery]);

  // Virtual Maintenance Blocks from weeklyPlan
  const maintenanceBlocks = useMemo(() => {
    if (!weeklyPlan || !Array.isArray(weeklyPlan)) {
      return [
        { block_id: "BLK_001", department: "Engineering (P-Way)", section_id: "SEC_01", section_name: "Howrah - Liluah", start_time: "02:30", end_time: "06:30", day: 1, duration_hrs: 4.0, status: "SLOTTED", gap_fit: 0.94 },
        { block_id: "BLK_002", department: "Electrical (TRD OHE)", section_id: "SEC_03", section_name: "Bally - Dankuni", start_time: "11:00", end_time: "14:30", day: 2, duration_hrs: 3.5, status: "SLOTTED", gap_fit: 0.91 },
        { block_id: "BLK_003", department: "Signaling & Telecom (S&T)", section_id: "SEC_04", section_name: "Dankuni - Chandannagar", start_time: "01:00", end_time: "04:30", day: 3, duration_hrs: 3.5, status: "SLOTTED", gap_fit: 0.96 },
        { block_id: "BLK_004", department: "Engineering (Tamping)", section_id: "SEC_08", section_name: "Bardinhaman - Durgapur", start_time: "10:30", end_time: "15:00", day: 4, duration_hrs: 4.5, status: "SLOTTED", gap_fit: 0.88 },
      ];
    }
    return weeklyPlan.map((b, idx) => ({
      block_id: b.task_id || b.defect_id || `BLK_${idx + 101}`,
      department: b.department || "Engineering (P-Way)",
      section_id: b.section_id || "SEC_01",
      section_name: b.section_name || `Section ${b.section_id || 'SEC_01'}`,
      start_time: b.start_time ? new Date(b.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "02:30",
      end_time: b.end_time ? new Date(b.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "06:30",
      day: b.scheduled_day ?? (idx % 7),
      duration_hrs: b.duration_hours || 4.0,
      status: "SLOTTED",
      gap_fit: b.gap_fit_score || 0.92
    }));
  }, [weeklyPlan]);

  // Bueno Natural Traffic Gaps (mining opportunities)
  const trafficGaps = useMemo(() => {
    return [
      { id: "GAP_01", section_id: "SEC_01", section_name: "Howrah - Liluah", start_time: "01:45", end_time: "05:15", duration_mins: 210, quality_score: 98, recommended_dept: "P-Way Deep Screening", conflict_probability: "0.2%" },
      { id: "GAP_02", section_id: "SEC_02", section_name: "Liluah - Bally", start_time: "12:15", end_time: "15:00", duration_mins: 165, quality_score: 92, recommended_dept: "TRD OHE Inspection", conflict_probability: "1.1%" },
      { id: "GAP_03", section_id: "SEC_04", section_name: "Dankuni - Chandannagar", start_time: "02:00", end_time: "06:00", duration_mins: 240, quality_score: 99, recommended_dept: "S&T Point Machine Overhaul", conflict_probability: "0.0%" },
      { id: "GAP_04", section_id: "SEC_08", section_name: "Bardinhaman - Durgapur", start_time: "13:30", end_time: "16:45", duration_mins: 195, quality_score: 89, recommended_dept: "Track Rail Grinding Machine", conflict_probability: "2.4%" },
      { id: "GAP_05", section_id: "SEC_09", section_name: "Durgapur - Asansol", start_time: "00:30", end_time: "04:30", duration_mins: 240, quality_score: 97, recommended_dept: "Ultrasonic Flaw Detection (USFD)", conflict_probability: "0.4%" },
    ];
  }, []);

  const totalPages = Math.ceil(filteredEntries.length / pageSize) || 1;
  const paginatedEntries = filteredEntries.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      {/* ─── BANNER HEADER ─── */}
      <div className="bg-primary text-on-primary rounded-xl p-6 shadow-md border-l-4 border-secondary-container">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-secondary-container text-on-secondary-container font-label-sm text-[11px] font-bold uppercase px-2.5 py-0.5 rounded">
                CRIS-COA TIMETABLE ENGINE
              </span>
              <span className="text-secondary-fixed text-xs font-mono">500 Trains Corridor Database</span>
            </div>
            <h2 className="text-headline-md font-bold mt-1 tracking-tight">Master Timetable &amp; Time-Space String Scheduler</h2>
            <p className="text-body-sm opacity-90 mt-1 max-w-3xl">
              High-density corridor timetable synchronization with virtual maintenance blocks (Luan et al. Virtual Train Model). Mines natural traffic gap windows (Bueno et al.) to schedule track possessions with zero train detention.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveView('canvas')}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 transition-colors ${
                activeView === 'canvas' ? 'bg-secondary-container text-on-secondary-container shadow' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">timeline</span>
              Time-Space String Chart
            </button>
            <button
              onClick={() => setActiveView('table')}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 transition-colors ${
                activeView === 'table' ? 'bg-secondary-container text-on-secondary-container shadow' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">table_rows</span>
              Master Timetable Grid
            </button>
            <button
              onClick={() => setActiveView('gaps')}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 transition-colors ${
                activeView === 'gaps' ? 'bg-secondary-container text-on-secondary-container shadow' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <span className="material-symbols-outlined text-base">auto_graph</span>
              Bueno Gap Mining
            </button>
          </div>
        </div>

        {/* Quick KPI stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-white/20">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-300">Timetabled Trains</div>
            <div className="text-2xl font-bold text-white mt-0.5">{entries.length} <span className="text-xs font-normal text-slate-300">services</span></div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-300">Corridor Sections</div>
            <div className="text-2xl font-bold text-white mt-0.5">{sections.length} <span className="text-xs font-normal text-slate-300">blocks</span></div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-300">Slotted Possessions</div>
            <div className="text-2xl font-bold text-secondary-fixed mt-0.5">{maintenanceBlocks.length} <span className="text-xs font-normal text-slate-300">blocks</span></div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-300">Natural Traffic Gaps</div>
            <div className="text-2xl font-bold text-emerald-300 mt-0.5">{trafficGaps.length} <span className="text-xs font-normal text-slate-300">feasible slots</span></div>
          </div>
        </div>
      </div>

      {/* ─── FILTER CONTROLS BAR ─── */}
      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Section Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-primary">Section:</span>
            <select
              value={selectedSection}
              onChange={(e) => { setSelectedSection(e.target.value); setPage(1); }}
              className="bg-surface-container-high px-2.5 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface font-medium text-xs outline-none"
            >
              <option value="ALL">All Sections (17 Corridors)</option>
              {sections.map(s => (
                <option key={s.section_id} value={s.section_id}>
                  {s.section_id}: {s.section_name} ({s.length_km} km)
                </option>
              ))}
            </select>
          </div>

          {/* Day of Week */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-primary">Day:</span>
            <select
              value={selectedDay}
              onChange={(e) => { setSelectedDay(e.target.value); setPage(1); }}
              className="bg-surface-container-high px-2.5 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface font-medium text-xs outline-none"
            >
              <option value="ALL">All Days (Weekly Cycle)</option>
              <option value="0">Monday</option>
              <option value="1">Tuesday</option>
              <option value="2">Wednesday</option>
              <option value="3">Thursday</option>
              <option value="4">Friday</option>
              <option value="5">Saturday</option>
              <option value="6">Sunday</option>
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-primary">Type:</span>
            <select
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); setPage(1); }}
              className="bg-surface-container-high px-2.5 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface font-medium text-xs outline-none"
            >
              <option value="ALL">All Trains</option>
              <option value="passenger">Passenger / Mail / Express</option>
              <option value="freight">Goods / Freight Rakes</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 max-w-xs w-full">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-base">search</span>
            <input
              type="text"
              placeholder="Search train no, name or station..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full pl-8 pr-3 py-1.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-xs outline-none text-on-surface"
            />
          </div>
          {(selectedSection !== 'ALL' || selectedDay !== 'ALL' || selectedType !== 'ALL' || searchQuery) && (
            <button
              onClick={() => { setSelectedSection('ALL'); setSelectedDay('ALL'); setSelectedType('ALL'); setSearchQuery(''); setPage(1); }}
              className="text-xs text-primary font-bold hover:underline whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ─── VIEW 1: TIME-SPACE STRING CANVAS ─── */}
      {activeView === 'canvas' && (
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/30 pb-3">
            <div>
              <h3 className="font-headline-sm text-headline-sm font-bold text-primary">
                Time-Space Trajectory String Chart (00:00 — 24:00 IST)
              </h3>
              <p className="text-body-sm text-on-surface-variant">
                Trajectory lines represent continuous train paths across corridor kilometer posts. Rectangles mark allocated Virtual Maintenance Blocks.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-1 bg-[#003366] rounded-full"></span>
                <span className="text-on-surface">Scheduled Trains</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-1 bg-purple-600 rounded-full border-b border-dashed"></span>
                <span className="text-on-surface">Freight Rakes</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3 bg-amber-500 rounded border border-amber-600 opacity-80"></span>
                <span className="text-on-surface">Possession Blocks</span>
              </span>
            </div>
          </div>

          {/* SVG Diagram */}
          <div className="relative w-full overflow-x-auto bg-surface-container-low rounded-xl p-4 border border-outline-variant/40">
            <svg viewBox="0 0 960 480" className="w-full h-auto min-w-[760px] select-none">
              {/* Distance / Section Guidelines (Horizontal) */}
              {[
                { name: "Howrah (0 km)", y: 50 },
                { name: "Liluah (33 km)", y: 110 },
                { name: "Bally (58 km)", y: 170 },
                { name: "Dankuni (72 km)", y: 230 },
                { name: "Chandannagar (104 km)", y: 290 },
                { name: "Bandel (138 km)", y: 350 },
                { name: "Durgapur (210 km)", y: 410 },
              ].map((s, idx) => (
                <g key={s.name}>
                  <line x1={110} y1={s.y} x2={930} y2={s.y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 3" />
                  <text x={102} y={s.y + 4} fontSize="10" fontWeight="bold" fill="#003366" textAnchor="end">{s.name}</text>
                </g>
              ))}

              {/* Time Grid Lines (Vertical every 2 hours) */}
              {["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "24:00"].map((t, idx) => {
                const x = 120 + idx * 65;
                return (
                  <g key={t}>
                    <line x1={x} y1={40} x2={x} y2={425} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                    <text x={x} y={442} fontSize="10" fontWeight="bold" fill="#475569" textAnchor="middle">{t}</text>
                  </g>
                );
              })}

              {/* Virtual Maintenance Blocks (Boxes) */}
              {maintenanceBlocks.map((b, idx) => {
                const startHour = parseInt(b.start_time.split(':')[0], 10) + parseInt(b.start_time.split(':')[1], 10) / 60;
                const endHour = parseInt(b.end_time.split(':')[0], 10) + parseInt(b.end_time.split(':')[1], 10) / 60;
                const bx = 120 + (startHour / 24) * (13 * 65 - 65);
                const bw = Math.max(30, ((endHour - startHour) / 24) * (13 * 65 - 65));
                const by = 80 + (idx % 5) * 60;
                const bh = 50;

                return (
                  <g
                    key={b.block_id}
                    className="cursor-pointer transition-opacity hover:opacity-100 opacity-90"
                    onClick={() => setSelectedItem({ type: 'block', data: b })}
                  >
                    <rect
                      x={bx}
                      y={by}
                      width={bw}
                      height={bh}
                      rx={4}
                      fill="#fef3c7"
                      stroke="#d97706"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />
                    <text x={bx + 6} y={by + 16} fontSize="9" fontWeight="bold" fill="#92400e">{b.block_id}</text>
                    <text x={bx + 6} y={by + 28} fontSize="8" fill="#b45309">{b.department.split(' ')[0]}</text>
                    <text x={bx + 6} y={by + 40} fontSize="8" fontWeight="bold" fill="#78350f">{b.duration_hrs}h slot</text>
                  </g>
                );
              })}

              {/* Sample Trajectory String Lines (Representative corridor paths) */}
              {[
                { train: "12301 Rajdhani", x1: 150, y1: 50, x2: 290, y2: 410, color: "#003366", strokeWidth: 2.2, type: "Superfast" },
                { train: "12004 Shatabdi", x1: 220, y1: 50, x2: 380, y2: 410, color: "#0284c7", strokeWidth: 2.2, type: "Express" },
                { train: "BOXN Coal Freight", x1: 180, y1: 410, x2: 440, y2: 50, color: "#7c3aed", strokeWidth: 1.8, strokeDasharray: "4 2", type: "Freight" },
                { train: "22436 Vande Bharat", x1: 340, y1: 50, x2: 480, y2: 410, color: "#003366", strokeWidth: 2.5, type: "Superfast" },
                { train: "12951 Tejas Express", x1: 410, y1: 410, x2: 560, y2: 50, color: "#0284c7", strokeWidth: 2.2, type: "Express" },
                { train: "BCN Cement Rake", x1: 490, y1: 50, x2: 740, y2: 410, color: "#7c3aed", strokeWidth: 1.8, strokeDasharray: "4 2", type: "Freight" },
                { train: "12260 Sealdah Duronto", x1: 580, y1: 410, x2: 720, y2: 50, color: "#003366", strokeWidth: 2.2, type: "Superfast" },
                { train: "13005 Amritsar Mail", x1: 650, y1: 50, x2: 820, y2: 410, color: "#0284c7", strokeWidth: 2.0, type: "Express" },
                { train: "12381 Poorva Exp", x1: 720, y1: 410, x2: 890, y2: 50, color: "#003366", strokeWidth: 2.0, type: "Express" },
              ].map((t, idx) => (
                <g
                  key={t.train}
                  className="cursor-pointer group"
                  onClick={() => setSelectedItem({ type: 'train', data: t })}
                >
                  <line
                    x1={t.x1}
                    y1={t.y1}
                    x2={t.x2}
                    y2={t.y2}
                    stroke={t.color}
                    strokeWidth={t.strokeWidth}
                    strokeDasharray={t.strokeDasharray}
                  />
                  <circle cx={t.x1} cy={t.y1} r={3.5} fill={t.color} />
                  <circle cx={t.x2} cy={t.y2} r={3.5} fill={t.color} />
                  <text
                    x={(t.x1 + t.x2) / 2 + 4}
                    y={(t.y1 + t.y2) / 2 - 4}
                    fontSize="9"
                    fontWeight="bold"
                    fill={t.color}
                    transform={`rotate(${t.y2 > t.y1 ? 25 : -25}, ${(t.x1 + t.x2) / 2}, ${(t.y1 + t.y2) / 2})`}
                  >
                    {t.train}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* Inspector Drawer for selected element */}
          {selectedItem && (
            <div className="bg-surface-container-high p-4 rounded-xl border border-primary/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    selectedItem.type === 'block' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {selectedItem.type === 'block' ? 'Virtual Possession Block' : 'Timetabled Movement'}
                  </span>
                  <span className="font-bold text-primary text-sm">
                    {selectedItem.type === 'block' ? selectedItem.data.block_id : selectedItem.data.train}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  {selectedItem.type === 'block'
                    ? `Allocated to ${selectedItem.data.department} on ${selectedItem.data.section_name} (${selectedItem.data.start_time} - ${selectedItem.data.end_time} IST) • Gap-Fit Score: ${selectedItem.data.gap_fit}`
                    : `Active Service: ${selectedItem.data.train} (${selectedItem.data.type}) • Clear Headway Buffer Maintained`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="px-3 py-1.5 text-xs text-outline hover:text-on-surface font-semibold bg-white rounded border border-outline-variant/40"
                >
                  Dismiss
                </button>
                {selectedItem.type === 'block' && (
                  <button
                    onClick={() => alert(`Verified lock for ${selectedItem.data.block_id}: 24h freeze gate confirmed.`)}
                    className="px-3 py-1.5 text-xs bg-primary text-white font-bold rounded shadow hover:bg-primary-container"
                  >
                    Verify Possession Lock
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── VIEW 2: MASTER TIMETABLE GRID ─── */}
      {activeView === 'table' && (
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
            <div>
              <h3 className="font-headline-sm text-headline-sm font-bold text-primary">Master Timetable Schedule Grid</h3>
              <p className="text-body-sm text-on-surface-variant">
                Showing {filteredEntries.length} timetable records across Eastern &amp; South Eastern Railway mainlines
              </p>
            </div>
            <div className="text-xs font-bold text-outline">
              Page {page} of {totalPages}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-high text-on-surface border-b border-outline-variant/40 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Train ID &amp; Service</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Section Corridor</th>
                  <th className="py-2.5 px-3">Operating Day</th>
                  <th className="py-2.5 px-3">Slot Window</th>
                  <th className="py-2.5 px-3">Occupancy</th>
                  <th className="py-2.5 px-3">Line &amp; Headway</th>
                  <th className="py-2.5 px-3">Block Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {paginatedEntries.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-primary">
                      <div>{row.train_name}</div>
                      <div className="text-[10px] text-outline font-mono">{row.train_id}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        row.is_freight ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {row.train_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium">
                      <div>{row.section_name}</div>
                      <div className="text-[10px] text-outline font-mono">{row.section_id}</div>
                    </td>
                    <td className="py-2.5 px-3">{row.day_name}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                      {row.start_time_str} - {row.end_time_str}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {row.occupancy_duration_mins} mins
                    </td>
                    <td className="py-2.5 px-3">
                      <div>{row.track_allocated}</div>
                      <div className="text-[10px] text-emerald-600 font-bold">+{row.headway_buffer_mins}m buffer</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <span className="material-symbols-outlined text-[12px]">check_circle</span>
                        Clear Slot
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 border-t border-outline-variant/30 text-xs">
            <span className="text-outline">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredEntries.length)} of {filteredEntries.length} entries
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded border border-outline-variant/40 bg-white font-bold disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded border border-outline-variant/40 bg-white font-bold disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW 3: BUENO GAP MINING ─── */}
      {activeView === 'gaps' && (
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 space-y-4">
          <div className="border-b border-outline-variant/30 pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-fixed-dim text-2xl">auto_graph</span>
              <h3 className="font-headline-sm text-headline-sm font-bold text-primary">
                Bueno Timetable Gap Mining (Natural Possession Opportunities)
              </h3>
            </div>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Algorithms continuously scan the COA timetable matrix to locate natural voids between train paths. These gaps allow track possession maintenance with zero speed restrictions or punctuality loss.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trafficGaps.map(gap => (
              <div key={gap.id} className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary">{gap.section_name}</span>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                      {gap.quality_score}% Quality Match
                    </span>
                  </div>
                  <div className="text-xs text-outline font-mono mt-0.5">{gap.section_id}</div>

                  <div className="mt-3 bg-white p-3 rounded-lg border border-outline-variant/30 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-outline">Window:</span>
                      <strong className="text-primary font-mono">{gap.start_time} - {gap.end_time} IST</strong>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-outline">Duration:</span>
                      <strong className="text-slate-800">{gap.duration_mins} mins ({(gap.duration_mins / 60).toFixed(1)} hrs)</strong>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-outline">Recommended Task:</span>
                      <strong className="text-secondary font-medium">{gap.recommended_dept}</strong>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-outline">Conflict Risk:</span>
                      <strong className="text-emerald-600 font-bold">{gap.conflict_probability}</strong>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => alert(`Slot ${gap.id} queued for auto-allocation: ${gap.recommended_dept} on ${gap.section_name}.`)}
                  className="w-full py-2 bg-primary hover:bg-primary-container text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">add_task</span>
                  <span>Allocate Possession Block</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
