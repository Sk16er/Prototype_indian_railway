-- gateway/migrations/001_outbox.sql
-- Idempotent DDL for the publication outbox and audit_events tables.
-- Mounted into postgres's /docker-entrypoint-initdb.d — runs once on first container init.
-- Running the gateway's ensureSchema() is still safe on top of this (all CREATE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS publication_outbox (
  id              BIGSERIAL    PRIMARY KEY,
  idempotency_key TEXT         NOT NULL UNIQUE,
  plan_id         TEXT         NOT NULL,
  version         INTEGER      NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'confirmed', 'failed')),
  payload         JSONB        NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  error_detail    TEXT
);

-- Partial index: only index rows that need the reconciliation job's attention.
CREATE INDEX IF NOT EXISTS idx_outbox_pending_created
  ON publication_outbox (created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS audit_events (
  id          BIGSERIAL    PRIMARY KEY,
  outbox_id   BIGINT       REFERENCES publication_outbox(id) ON DELETE SET NULL,
  event_type  TEXT         NOT NULL,
  actor       TEXT,
  detail      JSONB,
  occurred_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_outbox_id ON audit_events (outbox_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred  ON audit_events (occurred_at DESC);
