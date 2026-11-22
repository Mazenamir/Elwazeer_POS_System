-- Migration 027: Multi-branch attendance & visibility scope for employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_scope VARCHAR(20) DEFAULT 'single';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_ids JSONB DEFAULT '[]'::jsonb;
