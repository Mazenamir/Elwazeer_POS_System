-- Migration 010: Notification Center & Branch Heartbeats Schema
-- Supports real-time branch connectivity tracking, read state, dismissal, and transfer updates

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id VARCHAR(255) PRIMARY KEY,
  user_id INTEGER,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_dismissed BOOLEAN DEFAULT FALSE
);

ALTER TABLE notification_reads ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS branch_heartbeats (
  branch_id INTEGER PRIMARY KEY,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_online BOOLEAN DEFAULT TRUE,
  meta TEXT
);

ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_branch_heartbeats_seen ON branch_heartbeats(last_seen_at);
