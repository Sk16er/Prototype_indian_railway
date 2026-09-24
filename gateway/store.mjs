/**
 * gateway/store.mjs
 *
 * Responsibilities:
 *  1. Deterministic idempotency key — derived ONLY from plan content (plan_id + version +
 *     normalized payload hash). No wall-clock values. Two identical publications → same key.
 *  2. Transactional outbox — every publication starts as "pending" in Postgres before any
 *     BDMS call is made. Confirmed in the same tx as the audit event.
 *  3. Atomic JSON persistence — write to temp file → fsync → rename. Never a partial write.
 *  4. Corrupt-state detection — refuse to start if JSON is unparseable unless
 *     BANDHAN_RESET_CORRUPT_STATE=1 is explicitly set. Never silently discard history.
 *  5. Degraded-mode signaling — if Postgres was configured but goes offline, set a flag that
 *     the health endpoint can read. Reject durable writes in that state.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

// ─── Postgres pool (lazy: only constructed when DATABASE_URL is set) ──────────
let _pool = null;
let _dbDegraded = false;
let _dbDegradedReason = null;

export async function initPool() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (_pool) return _pool;

  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;
  _pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });

  _pool.on('error', (err) => {
    _dbDegraded = true;
    _dbDegradedReason = err.message;
    console.error('[store] Postgres pool error — entering degraded mode:', err.message);
  });
  return _pool;
}

export function getPool() { return _pool; }
export function dbStatus() { return { degraded: _dbDegraded, reason: _dbDegradedReason }; }
export function markDbDegraded(reason) { _dbDegraded = true; _dbDegradedReason = reason; }

// ─── Phase 1: Deterministic idempotency key ───────────────────────────────────
/**
 * Build a deterministic idempotency key from plan content ONLY.
 * Inputs must NOT include any wall-clock values (generated_at, timestamps).
 *
 * @param {string} planId
 * @param {number|string} version
 * @param {object} payload  - normalized plan items (already sorted/canonicalized)
 * @returns {string} lowercase hex SHA-256, 64 chars
 */
export function buildIdempotencyKey(planId, version, payload) {
  const canonical = JSON.stringify({ planId, version, payload }, _sortedReplacer);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function _sortedReplacer(_key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).sort().reduce((acc, k) => {
      if (value[k] !== undefined) acc[k] = value[k];
      return acc;
    }, {});
  }
  return value;
}

// ─── Phase 1: Outbox DDL ──────────────────────────────────────────────────────
export async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS publication_outbox (
      id              BIGSERIAL PRIMARY KEY,
      idempotency_key TEXT        NOT NULL UNIQUE,
      plan_id         TEXT        NOT NULL,
      version         INTEGER     NOT NULL,
      status          TEXT        NOT NULL DEFAULT 'pending',
      payload         JSONB       NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at    TIMESTAMPTZ,
      error_detail    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_status_created
      ON publication_outbox (status, created_at)
      WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS audit_events (
      id          BIGSERIAL PRIMARY KEY,
      outbox_id   BIGINT      REFERENCES publication_outbox(id),
      event_type  TEXT        NOT NULL,
      actor       TEXT,
      detail      JSONB,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// ─── Phase 1: Outbox write helpers ────────────────────────────────────────────
/**
 * Insert a pending outbox record.
 * Returns { id, status, alreadyExists } — caller decides whether to proceed.
 */
export async function insertPendingPublication(pool, idempotencyKey, planId, version, payload) {
  const res = await pool.query(
    `INSERT INTO publication_outbox (idempotency_key, plan_id, version, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [idempotencyKey, planId, version, JSON.stringify(payload)]
  );
  if (res.rowCount === 0) {
    const existing = await pool.query(
      'SELECT id, status FROM publication_outbox WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    return { id: existing.rows[0].id, status: existing.rows[0].status, alreadyExists: true };
  }
  return { id: res.rows[0].id, status: 'pending', alreadyExists: false };
}

/**
 * Confirm a publication AND write the audit event in ONE transaction.
 * This is the ONLY path that transitions status → 'confirmed'.
 */
export async function confirmPublicationAndAudit(pool, outboxId, actor, detail) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE publication_outbox
          SET status = 'confirmed', confirmed_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id`,
      [outboxId]
    );
    if (updated.rowCount === 0) {
      // Already confirmed by a concurrent request — idempotent, not an error.
      await client.query('ROLLBACK');
      return;
    }
    await client.query(
      `INSERT INTO audit_events (outbox_id, event_type, actor, detail)
       VALUES ($1, 'PUBLICATION_CONFIRMED', $2, $3)`,
      [outboxId, actor, JSON.stringify(detail)]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Mark a publication as failed (leaves status = 'pending', safe to retry). */
export async function markPublicationFailed(pool, outboxId, errorDetail) {
  await pool.query(
    `UPDATE publication_outbox SET error_detail = $1 WHERE id = $2`,
    [String(errorDetail), outboxId]
  );
}

/** Fetch stale pending records for reconciliation. */
export async function fetchStalePendingRecords(pool, olderThanSeconds = 120) {
  const res = await pool.query(
    `SELECT id, idempotency_key, plan_id, version, payload, created_at, error_detail
       FROM publication_outbox
      WHERE status = 'pending'
        AND created_at < NOW() - ($1 * interval '1 second')
      ORDER BY created_at ASC
      LIMIT 100`,
    [olderThanSeconds]
  );
  return res.rows;
}

// ─── Phase 4: Atomic JSON persistence ────────────────────────────────────────
const DEFAULT_STATE = () => ({ publications: [], auditLog: [] });

/**
 * Load state from JSON file.
 * On parse failure: refuse to start unless BANDHAN_RESET_CORRUPT_STATE=1.
 */
export function loadStateSync(filePath) {
  if (!fs.existsSync(filePath)) return DEFAULT_STATE();

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`[store] Cannot read state file ${filePath}: ${err.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (parseErr) {
    const resetAllowed = process.env.BANDHAN_RESET_CORRUPT_STATE === '1';
    const msg = [
      `[store] CORRUPT state file: ${filePath}`,
      `  Parse error: ${parseErr.message}`,
      resetAllowed
        ? '  WARNING: BANDHAN_RESET_CORRUPT_STATE=1 — resetting to defaults. DATA WILL BE LOST.'
        : '  Set BANDHAN_RESET_CORRUPT_STATE=1 to explicitly allow reset and data loss.',
    ].join('\n');

    if (resetAllowed) {
      console.error(msg);
      return DEFAULT_STATE();
    }
    throw new Error(msg);  // Refuse to start. Operator must make an explicit choice.
  }
}

/**
 * Persist state atomically: write → fsync → rename.
 * A crash during write never corrupts the live file.
 */
export function saveStateSync(filePath, state) {
  const tmp = `${filePath}.tmp`;
  const data = JSON.stringify(state, null, 2);

  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);          // flush kernel buffers before rename
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath); // atomic on POSIX; near-atomic on Windows NTFS
}
