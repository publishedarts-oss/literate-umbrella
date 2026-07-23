-- HyperBundle demo schema expansion (SQLite)
-- Applied at runtime via CREATE IF NOT EXISTS; kept here for documentation.

CREATE TABLE IF NOT EXISTS fee_ledger (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  bundle_id TEXT,
  session_id TEXT,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury_balances (
  asset TEXT PRIMARY KEY,
  amount_usd REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS loyalty_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  visit_streak INTEGER DEFAULT 1,
  last_visit_day TEXT NOT NULL,
  shares_count INTEGER DEFAULT 0,
  purchases_count INTEGER DEFAULT 0,
  badges_json TEXT DEFAULT '[]',
  hold_flip REAL DEFAULT 0,
  hold_wfc REAL DEFAULT 0,
  hold_qc REAL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ab_group TEXT NOT NULL DEFAULT 'control_40pct',
  wallet_connected INTEGER DEFAULT 0,
  timestamp TEXT NOT NULL
);
