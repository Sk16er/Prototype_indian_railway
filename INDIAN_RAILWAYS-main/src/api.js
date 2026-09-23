const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error("Health check failed");
    return await res.json();
  } catch (err) {
    console.warn("Backend API offline, using fallback state:", err);
    return { status: "offline", service: "BANDHAN Local Fallback" };
  }
}

export async function fetchArchitecture() {
  try {
    const res = await fetch(`${API_BASE}/architecture`);
    if (!res.ok) throw new Error("Failed to fetch architecture");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchTasks() {
  try {
    const res = await fetch(`${API_BASE}/plan/tasks`);
    if (!res.ok) throw new Error("Failed to fetch tasks");
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function fetchWeeklyPlan(method = "optimized") {
  try {
    const res = await fetch(`${API_BASE}/plan/weekly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, time_limit_s: 15 })
    });
    if (!res.ok) throw new Error("Failed to fetch weekly plan");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchMonthlyPlan() {
  try {
    const res = await fetch(`${API_BASE}/plan/monthly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "optimized", horizon_days: 30, time_limit_s: 20 })
    });
    if (!res.ok) throw new Error("Failed to fetch monthly plan");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchReplan(eventType = "defect_burst", eventSection = "SEC_0001") {
  try {
    const res = await fetch(`${API_BASE}/plan/replan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: eventType,
        event_section: eventSection,
        num_new_defects: 5,
        surge_factor: 1.4,
        freeze_window_hrs: 24,
        time_limit_s: 15
      })
    });
    if (!res.ok) throw new Error("Failed to execute replan");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchComparison() {
  try {
    const res = await fetch(`${API_BASE}/plan/compare`);
    if (!res.ok) throw new Error("Failed to fetch benchmark comparison");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchTimeSpaceGraph() {
  try {
    const res = await fetch(`${API_BASE}/plan/time_space_graph`);
    if (!res.ok) throw new Error("Failed to fetch time space graph");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchDispatchPreview() {
  try {
    const res = await fetch(`${API_BASE}/plan/dispatch/preview`);
    if (!res.ok) throw new Error("Failed to fetch dispatch preview");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function checkFreezeLock(taskId, scheduledStart, dri) {
  try {
    const res = await fetch(`${API_BASE}/plan/freeze_check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        scheduled_start: scheduledStart,
        dynamic_risk_index: dri
      })
    });
    if (!res.ok) throw new Error("Failed freeze check");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchMlEvidence() {
  try {
    const res = await fetch(`${API_BASE}/plan/ml_evidence`);
    if (!res.ok) throw new Error("Failed to fetch ML evidence");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchPredictedBlockDemand() {
  try {
    const res = await fetch(`${API_BASE}/plan/predicted_block_demand`);
    if (!res.ok) throw new Error("Failed to fetch predicted block demand");
    return await res.json();
  } catch (err) {
    return null;
  }
}
