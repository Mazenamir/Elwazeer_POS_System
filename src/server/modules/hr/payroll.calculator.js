/**
 * Unified Elwazeer Monthly Payroll Calculator
 * Shared between HR Payslip API, Monthly Salary Sheet (SALARY), and Consolidated Excel Export.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function numOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'boolean') return val;
  if (val === 1 || val === '1' || String(val).toLowerCase() === 'true') return true;
  if (val === 0 || val === '0' || String(val).toLowerCase() === 'false') return false;
  return null;
}

function normalizeDateStr(val) {
  if (!val) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function getPreviousMonthKey(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthLastDayStr(month) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Computes default prorated work days inside a 30-day standard payroll month
 * based on employee join_date and end_date.
 */
function computeDefaultWorkDays(month, joinDate, endDate) {
  const monthStart = `${month}-01`;
  const monthEnd = getMonthLastDayStr(month);
  const joinStr = normalizeDateStr(joinDate);
  const endStr = normalizeDateStr(endDate);

  if (joinStr && joinStr > monthEnd) return 0;
  if (endStr && endStr < monthStart) return 0;

  let startDay = 1;
  if (joinStr && joinStr.slice(0, 7) === month) {
    startDay = Math.min(30, Math.max(1, parseInt(joinStr.slice(8, 10), 10) || 1));
  }

  let endDay = 30;
  if (endStr && endStr.slice(0, 7) === month) {
    endDay = Math.min(30, Math.max(1, parseInt(endStr.slice(8, 10), 10) || 30));
  }

  if (startDay > endDay) return 0;
  return Math.max(0, Math.min(30, endDay - startDay + 1));
}

function computeDefaultAllowedLeaves(workDays) {
  const wd = Math.max(0, Number(workDays) || 0);
  if (wd === 0) return 0;
  if (wd >= 26) return 4;
  return Math.round((wd / 30) * 4);
}

/**
 * Determines whether an employee should appear in a given month's payroll / OHDA sheet.
 * Resigned employees appear in the month they left (and any month with logged activity)
 * and disappear in subsequent months.
 */
function shouldIncludeEmployeeInMonth(employee, month, hasActivityInMonth = false) {
  if (hasActivityInMonth) return true;
  const monthStart = `${month}-01`;
  const monthEnd = getMonthLastDayStr(month);
  const joinStr = normalizeDateStr(employee?.join_date);
  const endStr = normalizeDateStr(employee?.end_date);

  if (joinStr && joinStr > monthEnd) return false;

  if (employee?.status === 'active') {
    if (endStr && endStr < monthStart) return false;
    return true;
  }

  // Inactive employee with no activity in month: include only if end_date is in or after this month
  if (endStr && endStr >= monthStart) {
    return true;
  }
  return false;
}

function summarizeAttendanceRows(attendanceRows = []) {
  let totalHours = 0;
  let absentCount = 0;
  let leaveCount = 0;
  let halfDayCount = 0;
  let presentCount = 0;

  for (const r of attendanceRows || []) {
    totalHours += Number(r.total_hours || 0);
    const notes = String(r.notes || '');
    const status = String(r.status || '');
    const isAbsent = notes.includes('غياب') || status === 'absent';
    const isLeave = notes.includes('جاز') || notes.includes('إجازة') || status === 'leave';
    const isHalf = notes.includes('نص يوم') || status === 'half_day';

    if (isAbsent) absentCount += 1;
    if (isLeave) leaveCount += 1;
    if (isHalf) halfDayCount += 1;
    if (!isAbsent && !isLeave && (status === 'present' || Number(r.total_hours || 0) > 0 || r.check_in)) {
      presentCount += 1;
    }
  }

  return {
    total_hours: round2(totalHours),
    absent_count: absentCount,
    leave_count: leaveCount,
    half_day_count: halfDayCount,
    present_count: presentCount,
  };
}

function summarizeTransactionRows(transactionRows = []) {
  let advances = 0;
  let deductions = 0;
  let bonuses = 0;
  let salaryPayments = 0;

  for (const r of transactionRows || []) {
    const amt = Number(r.amount || 0);
    if (r.type === 'advance') advances += amt;
    else if (r.type === 'deduction') deductions += amt;
    else if (r.type === 'bonus') bonuses += amt;
    else if (r.type === 'salary_payment') salaryPayments += amt;
  }

  return {
    advances: round2(advances),
    deductions: round2(deductions),
    bonuses: round2(bonuses),
    salary_payments: round2(salaryPayments),
  };
}

/**
 * Core unified calculation function.
 */
function calculateEmployeeMonthlyPayroll({
  employee,
  month,
  currentCairoMonth,
  attendanceRows = [],
  transactionRows = [],
  adjustment = null,
}) {
  const adj = adjustment || {};
  const masterBasicSalary = Number(employee?.basic_salary || 0);
  const basicSalaryOverride = numOrNull(adj.basic_salary_override);
  const basicSalary = basicSalaryOverride !== null ? Math.max(0, basicSalaryOverride) : masterBasicSalary;
  const dailyRate = round2(basicSalary / 30);

  const att = summarizeAttendanceRows(attendanceRows);
  const tx = summarizeTransactionRows(transactionRows);

  const defaultWorkDays = computeDefaultWorkDays(month, employee?.join_date, employee?.end_date);
  const workDaysOverride = numOrNull(adj.work_days);
  const workDays = Math.max(0, workDaysOverride !== null ? workDaysOverride : defaultWorkDays);

  const earnedBaseSalary = workDays === 30
    ? basicSalary
    : round2(workDays * dailyRate);

  const defaultAllowedLeaveDays = computeDefaultAllowedLeaves(workDays);
  const allowedLeaveOverride = numOrNull(adj.allowed_leave_days);
  const allowedLeaveDays = Math.max(0, allowedLeaveOverride !== null ? allowedLeaveOverride : defaultAllowedLeaveDays);

  const absentDaysOverride = numOrNull(adj.absent_days_override);
  const leaveDaysOverride = numOrNull(adj.leave_days_override);
  const halfDaysOverride = numOrNull(adj.half_days_override);

  const absentDays = Math.max(0, absentDaysOverride !== null ? absentDaysOverride : att.absent_count);
  const leaveDays = Math.max(0, leaveDaysOverride !== null ? leaveDaysOverride : att.leave_count);
  const halfDays = Math.max(0, halfDaysOverride !== null ? halfDaysOverride : att.half_day_count);

  const absentDeduction = Math.round(absentDays * dailyRate * 2);
  const leaveDeduction = leaveDays > allowedLeaveDays
    ? Math.round((leaveDays - allowedLeaveDays) * dailyRate)
    : 0;
  const halfDayDeduction = Math.round(halfDays * (dailyRate / 2));

  // Unused leave payout: automatic after month ends, or explicitly toggled
  const isMonthEnded = Boolean(currentCairoMonth && month < currentCairoMonth);
  const includeUnusedPref = boolOrNull(adj.include_unused_leave_payout);
  const effectiveUnusedLeaveEnabled = includeUnusedPref !== null ? includeUnusedPref : isMonthEnded;

  const rawUnusedLeaveDays = (effectiveUnusedLeaveEnabled && workDays > 0 && leaveDays < allowedLeaveDays)
    ? Math.max(0, allowedLeaveDays - leaveDays)
    : 0;
  const unusedLeaveOverride = numOrNull(adj.unused_leave_amount_override);
  const unusedLeaveAmount = unusedLeaveOverride !== null
    ? Math.round(unusedLeaveOverride)
    : Math.round(rawUnusedLeaveDays * dailyRate);

  // Variable required hours & Overtime (1.35x) / Delay (1.5x)
  const actualHours = att.total_hours;
  const requiredHours = Math.max(0, numOrNull(adj.required_hours) ?? 0);

  let overtimeHours = 0;
  let delayHours = 0;
  if (requiredHours > 0) {
    overtimeHours = actualHours > requiredHours ? round2(actualHours - requiredHours) : 0;
    delayHours = actualHours < requiredHours ? round2(requiredHours - actualHours) : 0;
  }

  const calcOvertimeAmount = Math.round(((dailyRate / 10) * 1.35) * overtimeHours);
  const calcDelayDeduction = Math.round(((dailyRate / 10) * 1.5) * delayHours);

  const overtimeOverride = numOrNull(adj.overtime_amount_override);
  const delayOverride = numOrNull(adj.delay_deduction_override);

  const overtimeAmount = overtimeOverride !== null ? Math.round(overtimeOverride) : calcOvertimeAmount;
  const delayDeduction = delayOverride !== null ? Math.round(delayOverride) : calcDelayDeduction;

  // Penalty days & manual financial entries
  const penaltyDays = Math.max(0, numOrNull(adj.penalty_days) ?? 0);
  const penaltyDaysAmount = Math.round(penaltyDays * dailyRate);

  const manualBonusesOverride = numOrNull(adj.manual_bonuses_override);
  const manualDeductionsOverride = numOrNull(adj.manual_deductions_override);
  const manualBonuses = manualBonusesOverride !== null ? manualBonusesOverride : tx.bonuses;
  const manualDeductions = manualDeductionsOverride !== null ? manualDeductionsOverride : tx.deductions;

  const commissions = numOrNull(adj.commissions) ?? 0;
  const transportationAllowance = numOrNull(adj.transportation_allowance) ?? 0;
  const oldAdvances = numOrNull(adj.old_advances) ?? 0;
  const previousDues = numOrNull(adj.previous_dues) ?? 0;
  const externalDebts = numOrNull(adj.external_debts) ?? 0;

  const totalAdditions = round2(
    unusedLeaveAmount + overtimeAmount + manualBonuses + commissions + transportationAllowance + previousDues
  );
  const grossSalary = round2(earnedBaseSalary + totalAdditions);

  // IMPORTANT: Advances are strictly separated from penalties/deductions!
  const deductionsWithoutAdvances = round2(
    absentDeduction + leaveDeduction + halfDayDeduction + delayDeduction + penaltyDaysAmount + manualDeductions
  );

  const netSalary = Math.round(grossSalary - tx.advances - deductionsWithoutAdvances - oldAdvances);
  const remainingBalance = Math.round(netSalary - tx.salary_payments);

  return {
    month,
    basic_salary: basicSalary,
    employee_master_basic_salary: masterBasicSalary,
    has_basic_salary_override: basicSalaryOverride !== null,
    daily_rate: dailyRate,
    work_days: workDays,
    default_work_days: defaultWorkDays,
    earned_base_salary: earnedBaseSalary,

    allowed_leave_days: allowedLeaveDays,
    default_allowed_leave_days: defaultAllowedLeaveDays,
    include_unused_leave_payout: includeUnusedPref,
    effective_unused_leave_enabled: effectiveUnusedLeaveEnabled,
    unused_leave_days: rawUnusedLeaveDays,
    unused_leave_amount: unusedLeaveAmount,
    has_unused_leave_override: unusedLeaveOverride !== null,

    actual_hours: actualHours,
    required_hours: requiredHours,
    overtime_hours: overtimeHours,
    overtime_amount: overtimeAmount,
    calc_overtime_amount: calcOvertimeAmount,
    has_overtime_override: overtimeOverride !== null,
    delay_hours: delayHours,
    delay_deduction: delayDeduction,
    calc_delay_deduction: calcDelayDeduction,
    has_delay_override: delayOverride !== null,

    absent_days: absentDays,
    absent_deduction: absentDeduction,
    leave_days: leaveDays,
    leave_deduction: leaveDeduction,
    half_days: halfDays,
    half_day_deduction: halfDayDeduction,
    penalty_days: penaltyDays,
    penalty_days_amount: penaltyDaysAmount,

    manual_bonuses: manualBonuses,
    tx_bonuses: tx.bonuses,
    manual_deductions: manualDeductions,
    tx_deductions: tx.deductions,
    commissions,
    transportation_allowance: transportationAllowance,
    previous_dues: previousDues,

    advances: tx.advances,
    old_advances: oldAdvances,
    external_debts: externalDebts,
    deductions_without_advances: deductionsWithoutAdvances,

    total_additions: totalAdditions,
    gross_salary: grossSalary,
    net_salary: netSalary,
    already_paid: tx.salary_payments,
    salary_payments: tx.salary_payments,
    remaining_balance: remainingBalance,

    present_days: att.present_count,
    has_saved_adjustment: Boolean(adjustment && (adjustment.id || adjustment.updated_at)),
    adjustment: adjustment || null,
  };
}

module.exports = {
  round2,
  numOrNull,
  boolOrNull,
  normalizeDateStr,
  getPreviousMonthKey,
  getMonthLastDayStr,
  computeDefaultWorkDays,
  computeDefaultAllowedLeaves,
  shouldIncludeEmployeeInMonth,
  summarizeAttendanceRows,
  summarizeTransactionRows,
  calculateEmployeeMonthlyPayroll,
};
