-- Migration 023: Granular RBAC, Multi-Branch Scoping, Token Freshness, Branch Rentals Feature, and Audit Logging

-- 1. Users table additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_scope VARCHAR(20) DEFAULT 'single';
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1;

-- Ensure admin has all-branch scope
UPDATE users SET branch_scope = 'all' WHERE role = 'admin' AND (branch_scope IS NULL OR branch_scope = 'single');

-- 2. Branches table rentals feature toggle
ALTER TABLE branches ADD COLUMN IF NOT EXISTS rentals_enabled BOOLEAN DEFAULT TRUE;

-- 3. Audit Logging Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(100),
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  outcome VARCHAR(50) DEFAULT 'success',
  details JSONB,
  ip_address VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
