import React, { useState } from 'react';

export default function ExecutionMonitor({ weeklyPlan }) {
  const [statusFilter, setStatusFilter] = useState("ALL");

  const mockExecutions = (weeklyPlan?.schedule || []).map((item, idx) => {
    const statuses = ["RUNNING", "COMPLETED", "RUNNING", "OVERRUN", "COMPLETED"];
    const status = statuses[idx % statuses.length];
    const plannedStart = String(item.start_time).substring(11, 16);
    const plannedEnd = String(item.end_time).substring(11, 16);
    const actualStart = plannedStart;
    const overrunMins = status === "OVERRUN" ? 25 : 0;
    const actualEnd = status === "OVERRUN" ? "15:25" : (status === "COMPLETED" ? plannedEnd : "In Progress");

    return {
      task_id: item.task_id || `BLK_EXEC_${idx+1}`,
      section_id: item.section_id || "SEC_0001",
      department: item.department || "Engineering",
      planned_start: plannedStart,
      planned_end: plannedEnd,
      actual_start: actualStart,
      actual_end: actualEnd,
      status: status,
      overrun_mins: overrunMins,
      asset_status: status === "COMPLETED" ? "Line Released (T-402 Handback)" : (status === "OVERRUN" ? "Infringement Caution" : "Possession Granted")
    };
  });

  const filtered = statusFilter === "ALL" ? mockExecutions : mockExecutions.filter(e => e.status === statusFilter);

  return (
    <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm border border-outline-variant/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/40 pb-gutter-md mb-gutter-md">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Real-Time Execution Monitor &amp; Line Handback</h2>
            <span className="bg-secondary text-on-secondary font-label-sm text-label-sm px-2.5 py-0.5 rounded font-bold uppercase">
              Planned vs Actual Execution
            </span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Live telemetry tracking of active block possessions, execution overruns, line handback protocols (T-402), and asset release status
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 mt-2 md:mt-0 font-label-sm text-label-sm">
          {["ALL", "RUNNING", "COMPLETED", "OVERRUN"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded font-bold uppercase transition-all ${statusFilter === s ? "bg-primary text-on-primary shadow" : "bg-surface-container-high text-on-surface hover:bg-surface-container"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Execution Ledger Table */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-container-high text-on-surface font-label-sm text-label-sm uppercase">
              <th className="py-2.5 px-3">Block ID &amp; Location</th>
              <th className="py-2.5 px-3">Department</th>
              <th className="py-2.5 px-3">Planned Window</th>
              <th className="py-2.5 px-3">Actual Execution</th>
              <th className="py-2.5 px-3">Execution Status</th>
              <th className="py-2.5 px-3 text-right">Asset Release Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm">
            {filtered.map((item, idx) => (
              <tr key={idx} className="hover:bg-surface-container-low transition-colors">
                <td className="py-3 px-3">
                  <div className="font-bold text-primary">{item.task_id}</div>
                  <div className="text-on-surface font-medium">{item.section_id}</div>
                </td>
                <td className="py-3 px-3">
                  <span className="bg-primary text-on-primary text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                    {item.department}
                  </span>
                </td>
                <td className="py-3 px-3 text-on-surface">
                  {item.planned_start} - {item.planned_end}
                </td>
                <td className="py-3 px-3 text-on-surface font-semibold">
                  {item.actual_start} - {item.actual_end}
                  {item.overrun_mins > 0 && <span className="text-error font-bold block text-[11px]">+{item.overrun_mins}m Overrun</span>}
                </td>
                <td className="py-3 px-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.status === "COMPLETED" ? "bg-on-tertiary-container/20 text-on-tertiary-container" : (item.status === "OVERRUN" ? "bg-error text-on-error" : "bg-secondary-fixed text-on-secondary-fixed")}`}>
                    {item.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-right font-medium text-on-surface-variant">
                  {item.asset_status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
