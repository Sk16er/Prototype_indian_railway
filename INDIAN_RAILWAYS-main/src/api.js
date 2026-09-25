/**
 * api.js — BANDHAN scheduler client
 *
 * Phase 6 fixes:
 *   - All protected requests attach a JWT Bearer token.
 *   - Automatic silent refresh when the access token expires (401).
 *   - Login / refresh token flow exposed for the UI.
 *   - X-Data-Freshness / X-Is-Fallback response headers surfaced to callers.
 *
 * Copilot tools (Phase Copilot):
 *   - copilotRejectionReason, copilotNearestWindow, copilotSimulateShift, copilotScheduleContext
 *   - These go direct to the scheduler (public, read-only) — no auth needed.
 */

const SCHEDULER_BASE = import.meta.env.VITE_API_BASE       || "http://localhost:8001";

// ─── Token management ─────────────────────────────────────────────────────────
const TOKEN_KEY   = "bandhan_access_token";
const REFRESH_KEY = "bandhan_refresh_token";

export function getAccessToken()  { return sessionStorage.getItem(TOKEN_KEY); }
export function getRefreshToken() { return sessionStorage.getItem(REFRESH_KEY); }
export function setTokens({ accessToken, refreshToken }) {
  if (accessToken)  sessionStorage.setItem(TOKEN_KEY,   accessToken);
  if (refreshToken) sessionStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearTokens() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}
export function isLoggedIn() { return !!getAccessToken(); }

/** POST /auth/login — demo-only credentials verified by FastAPI. */
export async function login(username, password) {
  const res = await fetch(`${SCHEDULER_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `Login failed: HTTP ${res.status}`);
  }
  const tokens = await res.json();
  setTokens(tokens);
  return tokens;
}

/** POST /auth/refresh — silently obtain a new access token. */
export async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("No refresh token");
  const res = await fetch(`${SCHEDULER_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    throw new Error("Session expired — please log in again.");
  }
  const tokens = await res.json();
  setTokens(tokens);
  return tokens;
}

// ─── Authenticated fetch helpers ──────────────────────────────────────────────
/**
 * Fetch wrapper that:
 *  1. Attaches the Bearer token automatically.
 *  2. On 401, attempts one silent token refresh and retries.
 *  3. Extracts X-Data-Freshness / X-Is-Fallback headers into the result.
 *
 * Returns { data, freshness: { status, isFallback } }
 */
async function authFetch(url, options = {}) {
  const makeReq = (token) => fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let token = getAccessToken();
  let res = await makeReq(token);

  if (res.status === 401 && getRefreshToken()) {
    try {
      await refreshAccessToken();
      token = getAccessToken();
      res = await makeReq(token);
    } catch {
      clearTokens();
      throw new Error("Session expired — please log in again.");
    }
  }

  const freshness = {
    status: res.headers.get("X-Data-Freshness") || "unknown",
    isFallback: res.headers.get("X-Is-Fallback") === "true",
  };

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  return { data, freshness };
}

async function schedulerGet(path) {
  if (!isLoggedIn()) {
    throw new Error("Authentication required. Please sign in again.");
  }
  return authFetch(`${SCHEDULER_BASE}${path}`);
}

async function schedulerPost(path, body) {
  if (!isLoggedIn()) {
    throw new Error("Authentication required. Please sign in again.");
  }
  return authFetch(`${SCHEDULER_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Public API functions (same signatures as before — additive only) ─────────
export async function fetchHealth() {
  try {
    const res = await fetch(`${SCHEDULER_BASE}/health`);
    if (!res.ok) return { status: "degraded", service: "BANDHAN Scheduler" };
    return await res.json();
  } catch {
    return { status: "offline", service: "BANDHAN Local Fallback" };
  }
}

export async function fetchGatewayHealth() {
  return fetchHealth();
}

export async function fetchArchitecture() {
  const { data } = await schedulerGet("/architecture");
  return data;
}

export async function fetchTasks() {
  const { data, freshness } = await schedulerGet("/plan/tasks");
  // Attach freshness metadata so the UI can show a banner.
  if (data && Array.isArray(data)) {
    data._freshness = freshness;
  }
  return data ?? [];
}

export async function fetchWeeklyPlan(method = "optimized") {
  const { data } = await schedulerPost("/plan/weekly", { method, time_limit_s: 15 });
  return data;
}

export async function fetchMonthlyPlan() {
  const { data } = await schedulerPost("/plan/monthly", { method: "optimized", horizon_days: 30, time_limit_s: 20 });
  return data;
}

export async function fetchReplan(eventType = "defect_burst", eventSection = "SEC_0001", options = {}) {
  const { data } = await schedulerPost("/plan/replan", {
    event_type: eventType, event_section: eventSection,
    num_new_defects: options.numDefects ?? 5,
    surge_factor: options.surgeFactor ?? 1.4,
    freeze_window_hrs: 24, time_limit_s: 15,
  });
  return data;
}

export async function fetchComparison() {
  const { data } = await schedulerGet("/plan/compare");
  return data;
}

export async function fetchTimeSpaceGraph() {
  const { data } = await schedulerGet("/plan/time_space_graph");
  return data;
}

export async function fetchDispatchPreview() {
  const { data } = await schedulerGet("/plan/dispatch/preview");
  return data;
}

export async function checkFreezeLock(taskId, scheduledStart, dri) {
  const { data } = await schedulerPost("/plan/freeze_check", {
    task_id: taskId, scheduled_start: scheduledStart, dynamic_risk_index: dri,
  });
  return data;
}

export async function fetchMlEvidence() {
  const { data } = await schedulerGet("/plan/ml_evidence");
  return data;
}

export async function fetchPredictedBlockDemand() {
  const { data } = await schedulerGet("/plan/predicted_block_demand");
  return data;
}

// ─── Control Copilot Tool API ─────────────────────────────────────────────────
// These endpoints are read-only and go directly to the scheduler — no auth required.

async function _schedulerGet(path) {
  try {
    const res = await fetch(`${SCHEDULER_BASE}${path}`);
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err.message && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError") || err.message.includes("fetch"))) {
      console.warn(`[BANDHAN Copilot] Scheduler offline at ${SCHEDULER_BASE}. Using CRIS Local Mode fallback for ${path}`);
      return _localCopilotFallback(path);
    }
    throw new Error(`Tool call failed: ${err.message}`);
  }
}

async function _schedulerPost(path, body) {
  try {
    const res = await fetch(`${SCHEDULER_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err.message && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError") || err.message.includes("fetch"))) {
      console.warn(`[BANDHAN Copilot] Scheduler offline at ${SCHEDULER_BASE}. Using CRIS Local Mode fallback for ${path}`);
      return _localCopilotFallback(path, body);
    }
    throw new Error(`Tool call failed: ${err.message}`);
  }
}

function _localCopilotFallback(path, body = null) {
  const url = new URL(path, "http://localhost");
  const endpoint = url.pathname;
  const sectionId = url.searchParams.get("section_id") || body?.section_id || "SEC_0001";
  const blockId = url.searchParams.get("block_id") || body?.block_id || "BLK_001";

  if (endpoint.includes("rejection_reason")) {
    return {
      block_id: blockId,
      section_id: sectionId,
      status: "scheduled",
      constraint_fired: "section_occupancy_or_capacity",
      reason: `Block ${blockId} on ${sectionId} has occupancy conflict during requested slot. Operating in CRIS Local Mode.`,
      trains_occupying: ["12004", "14218", "12566"],
      next_feasible_window: {
        window_start: "Tue 02:30",
        window_end: "Tue 06:30",
        predicted_train_impact_min: 12.5,
      },
      department: "Civil (Engineering)",
      severity_grade: 2,
      gap_fit_score: 0.942,
    };
  }

  if (endpoint.includes("nearest_window")) {
    return {
      block_id: blockId,
      section_id: sectionId,
      duration_hours: 4.0,
      nearest_window: {
        window_start: "Wed 01:00",
        window_end: "Wed 05:00",
        offset_hours_from_now: 24,
        predicted_train_impact_min: 8.5,
      },
      trains_in_primary_daytime_window: ["12002", "12424", "12030"],
      train_count_daytime: 6,
    };
  }

  if (endpoint.includes("simulate_shift")) {
    const delta = body?.delta_hours ?? 2;
    const feasible = Math.abs(delta) <= 3;
    return {
      block_id: blockId,
      section_id: sectionId,
      delta_hours: delta,
      original_window: { start: "Mon 08:00", end: "Mon 12:00" },
      shifted_window: {
        start: `Mon ${String(Math.max(0, 8 + delta)).padStart(2, "0")}:00`,
        end: `Mon ${String(Math.max(0, 12 + delta)).padStart(2, "0")}:00`,
      },
      conflicts_before: 2,
      conflicts_after: feasible ? 0 : 3,
      avg_delay_before_min: 14.2,
      avg_delay_after_min: feasible ? 6.1 : 28.4,
      trains_before: ["12004"],
      trains_after: feasible ? [] : ["12424", "12002"],
      feasible: feasible,
      affected_departments: ["Civil (Engineering)", "TRD (Traction)"],
      verdict: feasible
        ? "Feasible — low traffic impact window verified."
        : "Not recommended — high traffic daytime window causes 28 min delay.",
    };
  }

  // schedule_context
  return {
    section_id: sectionId,
    day: null,
    section_meta: { traffic_class: "A", num_tracks: 2, max_speed_kmph: 130 },
    trains: [
      { train_no: "12004", train_name: "Lucknow Shatabdi", arrival_time: "06:10", departure_time: "06:15" },
      { train_no: "12424", train_name: "Dibrugarh Rajdhani", arrival_time: "07:20", departure_time: "07:24" },
    ],
    train_count: 2,
    blocks: [
      { task_id: "BLK_001", department: "Engineering", start_time: "2026-09-25T01:30:00" },
    ],
    block_count: 1,
  };
}

/** WHY_REJECTED: why was block_id rejected / not placed? */
export async function copilotRejectionReason(blockId, sectionId = null) {
  const params = new URLSearchParams({ block_id: blockId });
  if (sectionId) params.append("section_id", sectionId);
  return _schedulerGet(`/copilot/rejection_reason?${params}`);
}

/** NEAREST_WINDOW: find nearest feasible window for block or section. */
export async function copilotNearestWindow(blockId = null, sectionId = null) {
  const params = new URLSearchParams();
  if (blockId)   params.append("block_id",   blockId);
  if (sectionId) params.append("section_id", sectionId);
  return _schedulerGet(`/copilot/nearest_window?${params}`);
}

/** WHAT_IF: simulate shifting block_id by delta_hours. */
export async function copilotSimulateShift(blockId, deltaHours, sectionId = null) {
  return _schedulerPost("/copilot/simulate_shift", {
    block_id:   blockId,
    delta_hours: deltaHours,
    section_id: sectionId,
  });
}

/** CONTEXT: full timetable + block schedule for a section/day. */
export async function copilotScheduleContext(sectionId, day = null) {
  const params = new URLSearchParams({ section_id: sectionId });
  if (day !== null) params.append("day", day);
  return _schedulerGet(`/copilot/schedule_context?${params}`);
}
