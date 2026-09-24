/**
 * gateway/server.mjs
 *
 * Node/Express gateway for the BANDHAN railway dispatch prototype.
 * Implements:
 *   Phase 1 — Idempotent, transactional BDMS publication via outbox pattern
 *   Phase 2 — AbortController timeouts + selective retry on every outbound call
 *   Phase 3 — Real /health check (Postgres, FastAPI, disk)
 *   Phase 4 — Durable state (atomic JSON, degraded-mode rejection)
 *   Phase 6 — JWT auth with refresh tokens, rate-limited login, no secret fallback
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  initPool, getPool, dbStatus, markDbDegraded, buildIdempotencyKey,
  ensureSchema, insertPendingPublication, confirmPublicationAndAudit,
  markPublicationFailed, fetchStalePendingRecords,
  loadStateSync, saveStateSync,
} from './store.mjs';

// ─── Environment / startup validation ────────────────────────────────────────
const IS_TEST = process.env.NODE_ENV === 'test';

// Phase 6: Refuse to start with missing JWT_SECRET in non-test environments.
if (!process.env.JWT_SECRET && !IS_TEST) {
  console.error('[gateway] FATAL: JWT_SECRET env var is not set. Refusing to start.');
  process.exit(1);
}
const JWT_SECRET         = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
const JWT_ACCESS_TTL     = process.env.JWT_ACCESS_TTL  || '1h';
const JWT_REFRESH_TTL    = process.env.JWT_REFRESH_TTL || '8h';
const FASTAPI_URL        = process.env.FASTAPI_URL      || 'http://localhost:8001';
const BDMS_URL           = process.env.BDMS_URL         || null;   // null → simulation mode
const STATE_FILE         = process.env.STATE_FILE       || path.join(path.dirname(fileURLToPath(import.meta.url)), 'state.json');
const DISK_WARN_GB       = parseFloat(process.env.DISK_WARN_GB || '1');
const RECONCILE_INTERVAL = parseInt(process.env.RECONCILE_INTERVAL_S || '120', 10);

// ─── Phase 4: Load state — refuse to start on corruption ─────────────────────
let _state;
try {
  _state = loadStateSync(STATE_FILE);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

function persistState() {
  // If DB is configured but degraded, still persist JSON — but log loudly.
  if (dbStatus().degraded) {
    console.warn('[gateway] Persisting to JSON fallback while Postgres is degraded.');
  }
  saveStateSync(STATE_FILE, _state);
}

// ─── Postgres init ────────────────────────────────────────────────────────────
let _pool = null;
(async () => {
  _pool = await initPool();
  if (_pool) {
    try {
      await ensureSchema(_pool);
      console.log('[gateway] Postgres connected and schema ensured.');
    } catch (err) {
      console.error('[gateway] Postgres schema setup failed:', err.message);
      markDbDegraded(err.message);
    }
  }
})();

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── Phase 2: Timeout helpers ─────────────────────────────────────────────────
const TIMEOUTS = {
  fastapi_health:  5_000,   //  5 s — liveness/status checks
  fastapi_compute: 30_000,  // 30 s — plan generation (CPU-bound)
  llm:             10_000,  // 10 s — LLM calls (if any)
  bdms_dispatch:   15_000,  // 15 s — BDMS real-world dispatch
};

/**
 * fetch() wrapper with an AbortController timeout.
 * Does NOT retry by default — callers opt in explicitly for safe operations.
 */
async function timedFetch(url, options = {}, timeoutMs = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry wrapper for IDEMPOTENT (GET/status) calls only.
 * Never used for BDMS dispatch or any state-mutating action.
 *
 * @param {() => Promise<Response>} fn   - factory that makes one attempt
 * @param {number} maxAttempts
 * @param {number} baseDelayMs
 */
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 200) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fn();
      if (res.ok || (res.status >= 400 && res.status < 500)) return res; // 4xx = don't retry
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    // Exponential backoff with ±25% jitter
    const delay = baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5);
    await new Promise(r => setTimeout(r, delay));
  }
  throw lastErr;
}

// ─── Phase 6: Auth utilities ──────────────────────────────────────────────────
function signAccessToken(payload)  { return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_TTL }); }
function signRefreshToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_TTL, subject: 'refresh' }); }

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Bearer token' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Phase 6: Login endpoint with rate limiting ───────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

app.post('/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  // In this prototype, accept any non-empty credentials.
  // Replace with real identity check against DB or LDAP before production.
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const payload = { sub: username, role: 'planner' };
  return res.json({
    accessToken:  signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    expiresIn:    JWT_ACCESS_TTL,
  });
});

// ─── Phase 6: Refresh-token endpoint ─────────────────────────────────────────
app.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET, { subject: 'refresh' });
    const payload = { sub: decoded.sub, role: decoded.role };
    return res.json({
      accessToken:  signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      expiresIn:    JWT_ACCESS_TTL,
    });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ─── Phase 3: Real /health endpoint ──────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks = {};
  let allOk = true;

  // 1. Postgres connectivity
  if (process.env.DATABASE_URL) {
    if (dbStatus().degraded) {
      checks.postgres = { ok: false, error: dbStatus().reason };
      allOk = false;
    } else {
      try {
        const pool = getPool();
        if (!pool) throw new Error('Pool not initialized');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2000);
        await Promise.race([
          pool.query('SELECT 1'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Postgres 2s timeout')), 2000)),
        ]);
        clearTimeout(timer);
        checks.postgres = { ok: true };
      } catch (err) {
        markDbDegraded(err.message);
        checks.postgres = { ok: false, error: err.message };
        allOk = false;
      }
    }
  } else {
    checks.postgres = { ok: true, note: 'DATABASE_URL not configured — JSON fallback only' };
  }

  // 2. FastAPI scheduler reachability
  try {
    const r = await timedFetch(`${FASTAPI_URL}/health`, {}, TIMEOUTS.fastapi_health);
    checks.scheduler = { ok: r.ok, httpStatus: r.status };
    if (!r.ok) allOk = false;
  } catch (err) {
    checks.scheduler = { ok: false, error: err.message };
    allOk = false;
  }

  // 3. Free disk space
  try {
    const stat = fs.statfsSync ? fs.statfsSync(path.dirname(STATE_FILE)) : null;
    if (stat) {
      const freeGb = (stat.bfree * stat.bsize) / 1e9;
      const ok = freeGb >= DISK_WARN_GB;
      checks.disk = { ok, freeGb: freeGb.toFixed(2), thresholdGb: DISK_WARN_GB };
      if (!ok) allOk = false;
    } else {
      checks.disk = { ok: true, note: 'statfs not available on this platform' };
    }
  } catch (err) {
    checks.disk = { ok: false, error: err.message };
    allOk = false;
  }

  // 4. Degraded-mode signal
  if (dbStatus().degraded) {
    checks.mode = 'degraded';
    allOk = false;
  }

  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    service: 'BANDHAN Gateway',
    checks,
  });
});

// ─── Phase 1: Publication (transactional outbox) ──────────────────────────────
/**
 * POST /publish
 * Body: { planId, version, payload }
 *
 * Flow:
 *   1. Build deterministic idempotency key from content (no wall-clock).
 *   2. Write "pending" outbox record in Postgres (or JSON fallback).
 *   3. Call BDMS — with 15s timeout, NO automatic retry in the request path.
 *   4. On BDMS success → confirm outbox + write audit in one transaction.
 *   5. On BDMS failure → record stays "pending" for reconciliation job.
 *
 * Duplicate requests with identical payload hit the same idempotency key
 * and see "alreadyExists=true" → return the existing status without re-dispatching.
 */
app.post('/publish', requireAuth, async (req, res) => {
  const { planId, version, payload } = req.body || {};
  if (!planId || version == null || !payload) {
    return res.status(400).json({ error: 'planId, version, and payload required' });
  }

  // Phase 4: Reject durable writes when DB is configured but degraded.
  const pool = getPool();
  if (process.env.DATABASE_URL && dbStatus().degraded) {
    return res.status(503).json({
      error: 'Database is in degraded mode. Publication rejected to preserve durability guarantees.',
      degradedReason: dbStatus().reason,
    });
  }

  // Step 1: deterministic key — never includes generated_at or any clock value.
  const idempotencyKey = buildIdempotencyKey(String(planId), Number(version), payload);

  let outboxId;
  let alreadyExists = false;

  // Step 2: write "pending" record.
  if (pool) {
    const record = await insertPendingPublication(pool, idempotencyKey, planId, version, payload);
    outboxId = record.id;
    alreadyExists = record.alreadyExists;

    if (alreadyExists && record.status === 'confirmed') {
      return res.json({
        idempotencyKey,
        status: 'already_confirmed',
        message: 'Duplicate request — publication already confirmed. No re-dispatch.',
        outboxId,
      });
    }
  } else {
    // JSON fallback: check existing publications by key.
    const existing = _state.publications.find(p => p.idempotencyKey === idempotencyKey);
    if (existing?.status === 'confirmed') {
      return res.json({ idempotencyKey, status: 'already_confirmed', message: 'Duplicate — already confirmed.', outboxId: existing.id });
    }
    if (!existing) {
      const id = Date.now();
      _state.publications.push({ id, idempotencyKey, planId, version, status: 'pending', payload, createdAt: new Date().toISOString() });
      persistState();
      outboxId = id;
    } else {
      outboxId = existing.id;
      alreadyExists = true;
    }
  }

  // Step 3: Call BDMS — timeout 15s, NO automatic retry.
  let bdmsResult = null;
  let bdmsError  = null;

  if (BDMS_URL) {
    try {
      // IMPORTANT: timedFetch is called directly — withRetry is NOT used here.
      const bdmsRes = await timedFetch(
        `${BDMS_URL}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ idempotencyKey, planId, version, payload }),
        },
        TIMEOUTS.bdms_dispatch
      );

      if (!bdmsRes.ok) {
        bdmsError = `BDMS returned HTTP ${bdmsRes.status}`;
      } else {
        bdmsResult = await bdmsRes.json().catch(() => ({}));
      }
    } catch (err) {
      bdmsError = err.name === 'AbortError' ? 'BDMS timed out after 15s' : err.message;
    }
  } else {
    // Simulation mode — treat as success for development.
    bdmsResult = { simulated: true, idempotencyKey };
  }

  // Step 4/5: Confirm or record failure.
  if (!bdmsError) {
    try {
      if (pool) {
        await confirmPublicationAndAudit(pool, outboxId, req.user?.sub || 'system', bdmsResult);
      } else {
        const pub = _state.publications.find(p => p.id === outboxId);
        if (pub) { pub.status = 'confirmed'; pub.confirmedAt = new Date().toISOString(); }
        _state.auditLog.push({ outboxId, eventType: 'PUBLICATION_CONFIRMED', actor: req.user?.sub, detail: bdmsResult, occurredAt: new Date().toISOString() });
        persistState();
      }
      return res.json({ idempotencyKey, status: 'confirmed', outboxId, bdmsResult });
    } catch (dbErr) {
      console.error('[publish] DB confirm failed after BDMS success:', dbErr.message);
      // BDMS succeeded but local DB failed — this is the critical failure mode.
      // Record stays "pending" for reconciliation; return 500 so client knows to check.
      return res.status(500).json({
        error: 'BDMS dispatched but local confirmation failed — record will be reconciled.',
        idempotencyKey,
        outboxId,
      });
    }
  } else {
    // BDMS failed — record stays "pending" and can be retried with the same key.
    if (pool) {
      await markPublicationFailed(pool, outboxId, bdmsError).catch(() => {});
    } else {
      const pub = _state.publications.find(p => p.id === outboxId);
      if (pub) pub.errorDetail = bdmsError;
      persistState();
    }
    return res.status(502).json({
      error: 'BDMS dispatch failed. Record is pending and can be retried.',
      idempotencyKey,
      outboxId,
      bdmsError,
    });
  }
});

// ─── FastAPI proxy routes — all with per-dependency timeouts ─────────────────

/** Generic proxy for read-only (GET) FastAPI routes with retry. */
async function proxyGet(req, res, fastApiPath, timeoutMs = TIMEOUTS.fastapi_compute) {
  try {
    const apiRes = await withRetry(
      () => timedFetch(`${FASTAPI_URL}${fastApiPath}`, {}, timeoutMs),
      3, 300
    );
    const body = await apiRes.json().catch(() => ({}));
    return res.status(apiRes.status).json(body);
  } catch (err) {
    return res.status(502).json({ error: `FastAPI unavailable: ${err.message}` });
  }
}

/** Proxy for POST routes to FastAPI — with timeout, NO retry (not idempotent). */
async function proxyPost(req, res, fastApiPath, timeoutMs = TIMEOUTS.fastapi_compute) {
  try {
    const apiRes = await timedFetch(
      `${FASTAPI_URL}${fastApiPath}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) },
      timeoutMs
    );
    const body = await apiRes.json().catch(() => ({}));
    return res.status(apiRes.status).json(body);
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? `FastAPI request timed out after ${timeoutMs}ms` : `FastAPI unavailable: ${err.message}`,
    });
  }
}

// Routes — protected by JWT auth
app.get('/api/health',                  requireAuth, (req, res) => proxyGet(req, res, '/health', TIMEOUTS.fastapi_health));
app.get('/api/architecture',            requireAuth, (req, res) => proxyGet(req, res, '/architecture'));
app.get('/api/tasks',                   requireAuth, (req, res) => proxyGet(req, res, '/plan/tasks'));
app.post('/api/plan/weekly',            requireAuth, (req, res) => proxyPost(req, res, '/plan/weekly'));
app.post('/api/plan/monthly',           requireAuth, (req, res) => proxyPost(req, res, '/plan/monthly'));
app.post('/api/plan/replan',            requireAuth, (req, res) => proxyPost(req, res, '/plan/replan'));
app.get('/api/plan/compare',            requireAuth, (req, res) => proxyGet(req, res, '/plan/compare'));
app.get('/api/plan/time_space_graph',   requireAuth, (req, res) => proxyGet(req, res, '/plan/time_space_graph'));
app.get('/api/plan/dispatch/preview',   requireAuth, (req, res) => proxyGet(req, res, '/plan/dispatch/preview'));
app.post('/api/plan/freeze_check',      requireAuth, (req, res) => proxyPost(req, res, '/plan/freeze_check'));
app.get('/api/plan/ml_evidence',        requireAuth, (req, res) => proxyGet(req, res, '/plan/ml_evidence'));
app.get('/api/plan/predicted_block_demand', requireAuth, (req, res) => proxyGet(req, res, '/plan/predicted_block_demand'));

// ─── Phase 1: Reconciliation job ─────────────────────────────────────────────
/**
 * Runs every RECONCILE_INTERVAL seconds. Scans "pending" records older than
 * RECONCILE_INTERVAL seconds and flags them for manual operator review.
 *
 * Does NOT auto-resubmit blindly. If BDMS supports a status-check endpoint,
 * use that to confirm; otherwise mark for manual review.
 */
async function runReconciliation() {
  const pool = getPool();
  if (!pool || dbStatus().degraded) return;
  try {
    const stale = await fetchStalePendingRecords(pool, RECONCILE_INTERVAL);
    if (stale.length === 0) return;

    console.warn(`[reconcile] Found ${stale.length} stale pending publication(s):`);
    for (const rec of stale) {
      console.warn(`  [reconcile] id=${rec.id} key=${rec.idempotency_key} age=${
        Math.round((Date.now() - new Date(rec.created_at)) / 1000)
      }s — flagging for manual review`);

      // If BDMS supports a status check, try it here — DO NOT re-dispatch.
      if (BDMS_URL) {
        try {
          const statusRes = await timedFetch(
            `${BDMS_URL}/status/${rec.idempotency_key}`,
            {},
            TIMEOUTS.fastapi_health
          );
          if (statusRes.ok) {
            const status = await statusRes.json().catch(() => ({}));
            if (status.confirmed) {
              await confirmPublicationAndAudit(pool, rec.id, 'reconciliation-job', status);
              console.log(`  [reconcile] id=${rec.id} confirmed via BDMS status check.`);
              continue;
            }
          }
        } catch {
          // BDMS status check failed — fall through to manual review flag.
        }
      }

      // Flag for manual review (add note to error_detail — leave status as 'pending').
      await markPublicationFailed(
        pool, rec.id,
        `MANUAL_REVIEW_REQUIRED: stale pending after ${RECONCILE_INTERVAL}s. Previous: ${rec.error_detail || 'none'}`
      ).catch(() => {});
    }
  } catch (err) {
    console.error('[reconcile] Error during reconciliation:', err.message);
  }
}

// Schedule reconciliation — start immediately then repeat.
if (!IS_TEST) {
  runReconciliation();
  cron.schedule(`*/${Math.max(1, Math.floor(RECONCILE_INTERVAL / 60))} * * * *`, runReconciliation);
}

// ─── Server start ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.GATEWAY_PORT || '3001', 10);
if (!IS_TEST) {
  app.listen(PORT, () => console.log(`[gateway] Listening on :${PORT}`));
}

export { app, timedFetch, withRetry, runReconciliation };
export default app;
