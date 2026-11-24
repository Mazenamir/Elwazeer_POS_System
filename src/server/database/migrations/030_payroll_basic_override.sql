-- Migration 030: Add basic_salary_override to employee_payroll_adjustments
ALTER TABLE employee_payroll_adjustments ADD COLUMN IF NOT EXISTS basic_salary_override NUMERIC;
