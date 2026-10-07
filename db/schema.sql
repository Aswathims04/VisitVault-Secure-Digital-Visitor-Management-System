-- VisitVault schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('resident','guard','admin')),
  full_name     TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visitors (
  id            SERIAL PRIMARY KEY,
  resident_id   INTEGER REFERENCES users(id),
  name_enc      TEXT NOT NULL,
  phone_enc     TEXT NOT NULL,
  purpose       TEXT,
  valid_from    TIMESTAMPTZ NOT NULL,
  valid_to      TIMESTAMPTZ NOT NULL,
  token_id      TEXT UNIQUE NOT NULL,
  otp_hash      TEXT NOT NULL,
  otp_expires   TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','used','expired','revoked')),
  used_at       TIMESTAMPTZ,
  exit_at       TIMESTAMPTZ,
  consent_given BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visitors_token ON visitors(token_id);

CREATE TABLE IF NOT EXISTS ledger (
  id         BIGSERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id   INTEGER,
  actor_role TEXT,
  action     TEXT NOT NULL,
  details    TEXT,
  token_id   TEXT,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_ts ON ledger(ts);

CREATE TABLE IF NOT EXISTS alerts (
  id       BIGSERIAL PRIMARY KEY,
  ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL,
  message  TEXT NOT NULL,
  token_id TEXT,
  actor_id INTEGER
);

-- Append-only enforcement (no UPDATE/DELETE allowed, even by admin)
CREATE OR REPLACE FUNCTION block_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Ledger is append-only. Updates and deletes are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_change ON ledger;
CREATE TRIGGER ledger_no_change
  BEFORE UPDATE OR DELETE ON ledger
  FOR EACH ROW EXECUTE FUNCTION block_ledger_mutation();