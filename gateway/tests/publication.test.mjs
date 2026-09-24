/**
 * gateway/tests/publication.test.mjs
 *
 * Integration tests for Phase 1 (idempotent publication, transactional outbox).
 * Each test reproduces an original audit failure mode.
 *
 * Run: npm test (from gateway/)
 */

import { jest } from '@jest/globals';

// ─── Test helpers ─────────────────────────────────────────────────────────────
let app;
let buildIdempotencyKey;
let insertPendingPublication, confirmPublicationAndAudit, markPublicationFailed;

// We test the pure functions without a live DB/network.
// The server and store modules are imported once; fetch is mocked per test.

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  // Point to a non-existent BDMS URL so tests control responses via fetch mock.
  process.env.BDMS_URL = 'http://bdms-mock.test';

  ({ default: app } = await import('../server.mjs'));
  ({ buildIdempotencyKey, insertPendingPublication, confirmPublicationAndAudit, markPublicationFailed } = await import('../store.mjs'));
});

// ─── Unit: deterministic idempotency key ─────────────────────────────────────
describe('buildIdempotencyKey', () => {
  test('same inputs → same key', () => {
    const payload = [{ task_id: 'T1', section_id: 'SEC_01', start_time: '2026-10-07T02:00:00' }];
    const k1 = buildIdempotencyKey('PLAN-001', 3, payload);
    const k2 = buildIdempotencyKey('PLAN-001', 3, payload);
    expect(k1).toBe(k2);
  });

  test('key is exactly 64 hex chars (SHA-256)', () => {
    const k = buildIdempotencyKey('X', 1, {});
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });

  test('different planId → different key', () => {
    const payload = [{ task_id: 'T1' }];
    expect(buildIdempotencyKey('A', 1, payload)).not.toBe(buildIdempotencyKey('B', 1, payload));
  });

  test('different version → different key', () => {
    const payload = [{ task_id: 'T1' }];
    expect(buildIdempotencyKey('A', 1, payload)).not.toBe(buildIdempotencyKey('A', 2, payload));
  });

  test('key does NOT depend on object key order (canonical)', () => {
    const p1 = [{ a: 1, b: 2 }];
    const p2 = [{ b: 2, a: 1 }];
    expect(buildIdempotencyKey('P', 1, p1)).toBe(buildIdempotencyKey('P', 1, p2));
  });

  test('wall-clock value omitted from key derivation', () => {
    // Simulate what the old (broken) bdms.py did — include generated_at in the body
    // before hashing. The new key builder must not accept such a param.
    const k1 = buildIdempotencyKey('P', 1, { items: [] });
    // Even if caller tries to sneak in a timestamp, it goes into `payload`, not into
    // the key derivation arguments — but here we verify the function signature doesn't
    // accept a timestamp argument at all.
    const k2 = buildIdempotencyKey('P', 1, { items: [] });
    expect(k1).toBe(k2);
    // Sanity: function takes exactly (planId, version, payload)
    expect(buildIdempotencyKey.length).toBe(3);
  });
});

// ─── Integration: outbox state machine (mock DB) ──────────────────────────────
describe('outbox state machine', () => {
  // Build an in-memory mock pool that tracks calls.
  function makeMockPool() {
    const rows = [];
    let nextId = 1;
    const queries = [];

    const pool = {
      _rows: rows,
      _queries: queries,
      async query(sql, params) {
        queries.push({ sql, params });
        // INSERT with ON CONFLICT DO NOTHING
        if (sql.includes('ON CONFLICT (idempotency_key) DO NOTHING')) {
          const key = params[0];
          const existing = rows.find(r => r.idempotency_key === key);
          if (existing) return { rowCount: 0, rows: [] };
          const id = nextId++;
          rows.push({ id, idempotency_key: key, plan_id: params[1], version: params[2], status: 'pending', payload: params[3] });
          return { rowCount: 1, rows: [{ id }] };
        }
        // SELECT for alreadyExists check
        if (sql.includes('SELECT id, status FROM publication_outbox')) {
          const key = params[0];
          const row = rows.find(r => r.idempotency_key === key);
          return { rows: row ? [{ id: row.id, status: row.status }] : [] };
        }
        // UPDATE confirmed
        if (sql.includes("SET status = 'confirmed'")) {
          const id = params[0];
          const row = rows.find(r => r.id === id);
          if (row && row.status === 'pending') {
            row.status = 'confirmed';
            row.confirmed_at = new Date();
            return { rowCount: 1, rows: [{ id }] };
          }
          return { rowCount: 0, rows: [] };
        }
        // UPDATE error_detail
        if (sql.includes('SET error_detail')) {
          const [errorDetail, id] = params;
          const row = rows.find(r => r.id === id);
          if (row) row.error_detail = errorDetail;
          return { rowCount: 1, rows: [] };
        }
        // INSERT audit
        if (sql.includes('INSERT INTO audit_events')) {
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
      async connect() {
        // Minimal transaction support
        const client = {
          _pool: pool,
          async query(...args) { return pool.query(...args); },
          async release() {},
        };
        return client;
      },
    };
    return pool;
  }

  test('first publication inserts as pending, confirms on success', async () => {
    const pool = makeMockPool();
    const key = buildIdempotencyKey('P-TEST', 1, [{ task_id: 'T1' }]);

    const rec = await insertPendingPublication(pool, key, 'P-TEST', 1, [{ task_id: 'T1' }]);
    expect(rec.alreadyExists).toBe(false);
    expect(rec.status).toBe('pending');

    await confirmPublicationAndAudit(pool, rec.id, 'test-user', { simulated: true });
    const row = pool._rows.find(r => r.idempotency_key === key);
    expect(row.status).toBe('confirmed');
  });

  test('duplicate request with same key returns alreadyExists=true, no second insert', async () => {
    const pool = makeMockPool();
    const key = buildIdempotencyKey('P-TEST', 1, [{ task_id: 'T1' }]);

    const first  = await insertPendingPublication(pool, key, 'P-TEST', 1, [{ task_id: 'T1' }]);
    const second = await insertPendingPublication(pool, key, 'P-TEST', 1, [{ task_id: 'T1' }]);

    expect(first.alreadyExists).toBe(false);
    expect(second.alreadyExists).toBe(true);
    // Only one row exists.
    expect(pool._rows.filter(r => r.idempotency_key === key).length).toBe(1);
  });

  test('BDMS failure leaves record pending (safe to retry)', async () => {
    const pool = makeMockPool();
    const key = buildIdempotencyKey('P-FAIL', 1, [{ task_id: 'T2' }]);

    const rec = await insertPendingPublication(pool, key, 'P-FAIL', 1, [{ task_id: 'T2' }]);
    await markPublicationFailed(pool, rec.id, 'BDMS timed out after 15s');

    const row = pool._rows.find(r => r.idempotency_key === key);
    expect(row.status).toBe('pending');           // still pending — safe to retry
    expect(row.error_detail).toMatch(/timed out/);
    expect(rec.id).toEqual(row.id);
  });

  test('concurrent confirm is idempotent (second UPDATE rowCount=0 does not throw)', async () => {
    const pool = makeMockPool();
    const key = buildIdempotencyKey('P-CONC', 1, [{ task_id: 'T3' }]);

    const rec = await insertPendingPublication(pool, key, 'P-CONC', 1, [{ task_id: 'T3' }]);
    await confirmPublicationAndAudit(pool, rec.id, 'user1', {});
    // Second confirm should not throw — record already confirmed.
    await expect(confirmPublicationAndAudit(pool, rec.id, 'user2', {})).resolves.toBeUndefined();
  });
});

// ─── Integration: retry policy ────────────────────────────────────────────────
describe('withRetry — retry policy', () => {
  test('retries GET on 5xx and succeeds on second attempt', async () => {
    let calls = 0;
    const { withRetry } = await import('../server.mjs');
    const result = await withRetry(async () => {
      calls++;
      if (calls === 1) return new Response('{}', { status: 503 });
      return new Response('{"ok":true}', { status: 200 });
    }, 3, 0);
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  test('does NOT retry on 4xx (client error)', async () => {
    let calls = 0;
    const { withRetry } = await import('../server.mjs');
    const result = await withRetry(async () => {
      calls++;
      return new Response('{}', { status: 400 });
    }, 3, 0);
    expect(result.status).toBe(400);
    expect(calls).toBe(1);   // no retry on 4xx
  });
});
