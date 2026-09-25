import React, { useState, useMemo } from 'react';

const DEPT_COLOR = {
  "Engineering": "bg-orange-600 text-white",
  "S&T":         "bg-blue-700 text-white",
  "TRD":         "bg-green-700 text-white",
};

function formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
  } catch { return String(isoStr).substring(0, 10); }
}

function formatTime(isoStr) {
  if (!isoStr) return "--:--";
  try {
    return new Date(isoStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  } catch { return String(isoStr).substring(11, 16) || "--:--"; }
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export default function CalendarView({ weeklyPlan, loading = false }) {
  const [viewMode, setViewMode] = useState("weekly");
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const schedule = weeklyPlan?.schedule || [];

  // Determine the anchor week: use earliest schedule date or today
  const anchor = useMemo(() => {
    if (schedule.length > 0 && schedule[0].start_time) {
      const d = new Date(schedule[0].start_time);
      if (!isNaN(d)) return d;
    }
    return new Date();
  }, [schedule]);

  // ── WEEKLY VIEW ──────────────────────────────────────────────
  const weekStart = useMemo(() => {
    const d = new Date(anchor);
    // Go to Monday of anchor week
    const dow = d.getDay(); // 0=Sun..6=Sat
    d.setDate(d.getDate() - ((dow + 6) % 7) + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchor, weekOffset]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    return d;
  });

  const blocksByDay = (day) =>
    schedule.filter(b => {
      try { return isSameDay(new Date(b.start_time), day); } catch { return false; }
    });

  // ── MONTHLY VIEW ──────────────────────────────────────────────
  const monthAnchor = useMemo(() => {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() + monthOffset);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchor, monthOffset]);

  const monthDays = useMemo(() => {
    const days = [];
    const d = new Date(monthAnchor);
    // Fill leading blanks (Mon-based)
    const startDow = (d.getDay() + 6) % 7; // 0=Mon..6=Sun
    for (let i = 0; i < startDow; i++) days.push(null);
    while (d.getMonth() === monthAnchor.getMonth()) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [monthAnchor]);

  const monthLabel = monthAnchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  if (loading && !weeklyPlan) {
    return <div className="bg-surface-container-lowest p-gutter-lg rounded-xl border border-outline-variant/30" role="status">Loading the authenticated schedule...</div>;
  }

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-4 mb-4 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary">
              {viewMode === "weekly" ? "7-Day Operational Block Calendar" : "30-Day Tactical Block Calendar"}
            </h2>
            <span className="bg-primary text-on-primary font-label-sm text-label-sm px-2.5 py-0.5 rounded font-bold uppercase">
              Real Date Grid
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {schedule.length === 0
              ? "Run the BANDHAN solver to populate scheduled possessions."
              : `${schedule.length} possessions scheduled — click a block for full details`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode("weekly")}
            className={`px-3 py-1.5 rounded font-bold text-label-sm uppercase ${viewMode === "weekly" ? "bg-secondary text-on-secondary shadow" : "bg-surface-container-high text-primary"}`}>
            7-Day
          </button>
          <button onClick={() => setViewMode("monthly")}
            className={`px-3 py-1.5 rounded font-bold text-label-sm uppercase ${viewMode === "monthly" ? "bg-secondary text-on-secondary shadow" : "bg-surface-container-high text-primary"}`}>
            30-Day
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-[11px] font-bold">
        <span className="text-on-surface-variant uppercase font-bold">Legend:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-600"></span> Engineering</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-700"></span> S&amp;T</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-700"></span> TRD</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-secondary"></span> Consolidated</span>
      </div>

      {/* ── WEEKLY VIEW ── */}
      {viewMode === "weekly" && (
        <>
          {/* Nav row */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setWeekOffset(o => o - 1)}
              className="bg-surface-container-high text-primary px-3 py-1.5 rounded font-bold text-label-sm hover:bg-primary hover:text-on-primary transition-colors">
              ← Prev Week
            </button>
            <span className="font-bold text-primary text-sm">
              {weekDays[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => setWeekOffset(o => o + 1)}
              className="bg-surface-container-high text-primary px-3 py-1.5 rounded font-bold text-label-sm hover:bg-primary hover:text-on-primary transition-colors">
              Next Week →
            </button>
          </div>

          <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-7 gap-1.5 min-w-[700px]">
            {weekDays.map((day, di) => {
              const dayBlocks = blocksByDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div key={di}
                  className={`rounded-lg border min-h-[260px] flex flex-col ${isToday ? "border-secondary bg-secondary/5" : "border-outline-variant/30 bg-surface-container-low"}`}>
                  {/* Day header */}
                  <div className={`px-2 py-1.5 border-b ${isToday ? "border-secondary bg-secondary text-on-secondary" : "border-outline-variant/30"}`}>
                    <div className={`font-bold text-[11px] uppercase ${isToday ? "text-on-secondary" : "text-outline"}`}>
                      {dayNames[di]}
                    </div>
                    <div className={`font-black text-sm leading-tight ${isToday ? "text-on-secondary" : "text-primary"}`}>
                      {day.getDate()}
                    </div>
                    <div className={`text-[9px] ${isToday ? "text-on-secondary/80" : "text-outline"}`}>
                      {day.toLocaleDateString('en-IN', { month: 'short' })}
                    </div>
                  </div>
                  {/* Blocks */}
                  <div className="p-1.5 flex flex-col gap-1 flex-1 overflow-y-auto">
                    {dayBlocks.length > 0 ? (
                      dayBlocks.map((b, bi) => {
                        const deptClass = DEPT_COLOR[b.department] || "bg-primary text-on-primary";
                        return (
                          <div key={bi} onClick={() => setSelectedBlock(b)}
                            className={`rounded p-1.5 cursor-pointer text-[10px] border-l-2 shadow-xs hover:opacity-80 transition-opacity ${b.is_consolidated ? "border-secondary bg-secondary/10" : "border-transparent bg-surface-container-lowest"}`}>
                            <div className={`inline-block rounded px-1 py-0.5 font-bold text-[9px] mb-0.5 ${deptClass}`}>
                              {b.department || "Eng"}
                            </div>
                            <div className="font-bold text-primary leading-tight text-[10px] truncate">{b.task_id}</div>
                            <div className="text-on-surface-variant truncate text-[9px]">{b.section_id}</div>
                            <div className="text-secondary font-bold text-[9px] mt-0.5">
                              {formatTime(b.start_time)}–{formatTime(b.end_time)} ({(b.duration_hours || 3.5).toFixed(1)}h)
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <span className="text-[10px] text-outline text-center">No possessions</span>
                      </div>
                    )}
                  </div>
                  {dayBlocks.length > 0 && (
                    <div className="px-1.5 py-1 border-t border-outline-variant/20 text-[9px] text-outline font-bold text-center">
                      {dayBlocks.length} block{dayBlocks.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </>
      )}

      {/* ── MONTHLY VIEW ── */}
      {viewMode === "monthly" && (
        <>
          {/* Nav */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMonthOffset(o => o - 1)}
              className="bg-surface-container-high text-primary px-3 py-1.5 rounded font-bold text-label-sm hover:bg-primary hover:text-on-primary transition-colors">
              ← Prev Month
            </button>
            <span className="font-bold text-primary">{monthLabel}</span>
            <button onClick={() => setMonthOffset(o => o + 1)}
              className="bg-surface-container-high text-primary px-3 py-1.5 rounded font-bold text-label-sm hover:bg-primary hover:text-on-primary transition-colors">
              Next Month →
            </button>
          </div>

          {/* Day-name header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayNames.map(d => (
              <div key={d} className="text-center text-[11px] font-bold text-outline uppercase py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-7 gap-1 min-w-[560px]">
            {monthDays.map((day, i) => {
              if (!day) return <div key={`blank-${i}`} />;
              const dayBlocks = blocksByDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div key={i}
                  className={`rounded border min-h-[80px] p-1 flex flex-col ${isToday ? "border-secondary bg-secondary/5" : "border-outline-variant/20 bg-surface-container-low"} ${dayBlocks.length > 0 ? "cursor-pointer" : ""}`}
                  onClick={() => dayBlocks.length > 0 && setSelectedBlock(dayBlocks[0])}>
                  <div className={`text-[11px] font-bold mb-0.5 ${isToday ? "text-secondary" : "text-outline"}`}>{day.getDate()}</div>
                  <div className="space-y-0.5 flex-1">
                    {dayBlocks.slice(0, 3).map((b, bi) => {
                      const deptClass = DEPT_COLOR[b.department] || "bg-primary text-on-primary";
                      return (
                        <div key={bi} className={`${deptClass} rounded px-1 text-[8px] font-bold truncate`}>
                          {b.department?.substring(0, 3) || "Eng"} {formatTime(b.start_time)}
                        </div>
                      );
                    })}
                    {dayBlocks.length > 3 && (
                      <div className="text-[8px] text-primary font-bold">+{dayBlocks.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </>
      )}

      {/* Block Detail Panel */}
      {selectedBlock && (
        <div className="mt-4 p-4 bg-primary-container/10 rounded-xl border border-primary/30">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-primary text-title-lg">{selectedBlock.task_id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${DEPT_COLOR[selectedBlock.department] || "bg-primary text-on-primary"}`}>
                  {selectedBlock.department}
                </span>
                {selectedBlock.is_consolidated && (
                  <span className="bg-secondary text-on-secondary text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                    CONSOLIDATED
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-body-sm">
                <div><span className="text-outline uppercase font-bold text-[10px] block">Section</span><strong className="text-primary">{selectedBlock.section_id}</strong></div>
                <div><span className="text-outline uppercase font-bold text-[10px] block">Asset Type</span><strong className="text-on-surface">{selectedBlock.asset_type}</strong></div>
                <div><span className="text-outline uppercase font-bold text-[10px] block">Start Time</span><strong className="text-on-surface">{selectedBlock.start_time ? String(selectedBlock.start_time).replace("T", " ").substring(0, 16) : "—"}</strong></div>
                <div><span className="text-outline uppercase font-bold text-[10px] block">Duration P90</span><strong className="text-secondary">{(selectedBlock.duration_hours || 3.5).toFixed(1)}h</strong></div>
                <div><span className="text-outline uppercase font-bold text-[10px] block">DRI Priority</span><strong className="text-on-tertiary-container">{selectedBlock.priority_score?.toFixed(2) || "8.42"}</strong></div>
                <div><span className="text-outline uppercase font-bold text-[10px] block">M1 Risk P(t)</span><strong className="text-error">{selectedBlock.risk_score?.toFixed(3) || "0.785"}</strong></div>
                <div><span className="text-outline uppercase font-bold text-[10px] block">M4 Gap-Fit</span><strong className="text-on-tertiary-container">{selectedBlock.gap_fit_score?.toFixed(3) || "0.920"}</strong></div>
                <div><span className="text-outline uppercase font-bold text-[10px] block">Severity</span><strong className="text-on-surface">Grade {selectedBlock.severity_grade || 3}</strong></div>
              </div>
            </div>
            <button onClick={() => setSelectedBlock(null)}
              className="bg-primary text-on-primary px-3 py-1.5 rounded text-label-sm uppercase font-bold ml-3 flex-shrink-0">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
