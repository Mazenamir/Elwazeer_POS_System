-- Migration 033: Track actual branch_id on attendance records for multi-branch employees
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance(branch_id, date DESC);
