-- Migration 029: Payroll overhaul, persistent monthly adjustments, employee end_date, and drawer salary payout tracking

ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_date DATE;

ALTER TABLE employee_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';
ALTER TABLE employee_transactions ADD COLUMN IF NOT EXISTS paid_from_drawer BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS employee_payroll_adjustments (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  work_days NUMERIC,
  allowed_leave_days NUMERIC,
  include_unused_leave_payout BOOLEAN,
  unused_leave_amount_override NUMERIC,
  required_hours NUMERIC,
  overtime_amount_override NUMERIC,
  delay_deduction_override NUMERIC,
  absent_days_override NUMERIC,
  leave_days_override NUMERIC,
  half_days_override NUMERIC,
  penalty_days NUMERIC DEFAULT 0,
  manual_deductions_override NUMERIC,
  manual_bonuses_override NUMERIC,
  commissions NUMERIC DEFAULT 0,
  transportation_allowance NUMERIC DEFAULT 0,
  old_advances NUMERIC DEFAULT 0,
  previous_dues NUMERIC DEFAULT 0,
  external_debts NUMERIC DEFAULT 0,
  notes TEXT,
  updated_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  offline_uuid UUID UNIQUE,
  UNIQUE (employee_id, month)
);

CREATE INDEX IF NOT EXISTS idx_emp_payroll_adj_month ON employee_payroll_adjustments(month);
CREATE INDEX IF NOT EXISTS idx_emp_payroll_adj_employee_month ON employee_payroll_adjustments(employee_id, month);
