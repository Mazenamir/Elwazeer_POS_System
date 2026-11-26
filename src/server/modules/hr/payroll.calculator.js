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

function parseTimeToMinutes(timeVal) {
  if (timeVal === null || timeVal === undefined) return null;
  if (timeVal instanceof Date && !Number.isNaN(timeVal.getTime())) {
    return timeVal.getHours() * 60 + timeVal.getMinutes() + timeVal.getSeconds() / 60;
  }
  const raw = String(timeVal).trim();
  if (!raw) return null;

  // Match HH:MM, H:MM, HH:MM:SS, optional fractional seconds, optional AM/PM or Arabic ص/م, or ISO timezone suffix
  const timeMatch = raw.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*(AM|PM|ص|م)|(?:Z|[+-]\d{2}:?\d{2}))?$/i);
  if (!timeMatch) return null;

  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
  const rawMeridiem = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
  const meridiem = rawMeridiem === 'ص' ? 'AM' : (rawMeridiem === 'م' ? 'PM' : rawMeridiem);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else {
    if (hours === 24) hours = 0;
    if (hours < 0 || hours > 23) return null;
  }

  return hours * 60 + minutes + seconds / 60;
}

function normalizeTimeString(timeVal) {
  const mins = parseTimeToMinutes(timeVal);
  if (mins === null) return null;
  const totalSeconds = Math.round(mins * 60);
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function computeWorkedMinutes(checkIn, checkOut) {
  const inMin = parseTimeToMinutes(checkIn);
  const outMin = parseTimeToMinutes(checkOut);
  if (inMin === null || outMin === null) return 0;
  let diffMin = outMin - inMin;
  if (diffMin < 0) diffMin += 24 * 60;
  return Math.max(0, Math.min(24 * 60, diffMin));
}

function computeWorkedHours(checkIn, checkOut) {
  return round2(computeWorkedMinutes(checkIn, checkOut) / 60);
}

function formatHoursAsHHMM(val, { isMinutes = false } = {}) {
  const numericVal = Number(val);
  if (!Number.isFinite(numericVal) || numericVal <= 0) return '0:00';
  const totalMins = Math.round(Math.max(0, isMinutes ? numericVal : numericVal * 60));
  if (!Number.isFinite(totalMins) || totalMins <= 0) return '0:00';
  return `${Math.floor(totalMins / 60)}:${String(totalMins % 60).padStart(2, '0')}`;
}

function formatTime12HourAmPm(timeVal) {
  const mins = parseTimeToMinutes(timeVal);
  if (mins === null) return '';
  const wholeMins = Math.floor(mins);
  const h24 = Math.floor(wholeMins / 60) % 24;
  const m = wholeMins % 60;
  const meridiem = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${meridiem}`;
}

function computeAttendanceMetrics({ checkIn, checkOut, shiftStart, shiftEnd, status = 'present', notes = '' } = {}) {
  const statusStr = String(status || '').toLowerCase();
  const notesStr = String(notes || '');
  const isAbsent = statusStr === 'absent' || notesStr.includes('غياب');
  const isLeave = statusStr === 'leave' || notesStr.includes('جاز') || notesStr.includes('إجازة');

  const normIn = normalizeTimeString(checkIn);
  const normOut = normalizeTimeString(checkOut);

  if (isAbsent || isLeave) {
    return {
      check_in: normIn,
      check_out: normOut,
      total_hours: 0,
      late_minutes: 0,
      early_departure_minutes: 0,
      overtime_minutes: 0,
    };
  }

  const inMin = parseTimeToMinutes(normIn);
  const outMin = parseTimeToMinutes(normOut);
  const shiftStartMin = parseTimeToMinutes(shiftStart);
  const shiftEndMin = parseTimeToMinutes(shiftEnd);

  let lateMinutes = 0;
  if (shiftStartMin !== null && inMin !== null) {
    let diff = inMin - shiftStartMin;
    if (diff < -12 * 60) diff += 24 * 60;
    if (diff > 0) lateMinutes = Math.floor(diff);
  }

  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  if (shiftEndMin !== null && outMin !== null) {
    let effShiftEnd = shiftEndMin;
    let effOut = outMin;
    if (shiftStartMin !== null && shiftEndMin < shiftStartMin) {
      effShiftEnd += 24 * 60;
      if (effOut <= shiftEndMin) effOut += 24 * 60;
    } else if (inMin !== null && effOut < inMin) {
      effOut += 24 * 60;
    }
    if (effOut < effShiftEnd) {
      earlyDepartureMinutes = Math.floor(effShiftEnd - effOut);
    } else if (effOut > effShiftEnd) {
      overtimeMinutes = Math.floor(effOut - effShiftEnd);
    }
  }

  const totalHours = (inMin !== null && outMin !== null) ? computeWorkedHours(normIn, normOut) : 0;

  return {
    check_in: normIn,
    check_out: normOut,
    total_hours: totalHours,
    late_minutes: lateMinutes,
    early_departure_minutes: earlyDepartureMinutes,
    overtime_minutes: overtimeMinutes,
  };
}

function summarizeAttendanceRows(attendanceRows = []) {
  let totalMinutes = 0;
  let absentCount = 0;
  let leaveCount = 0;
  let halfDayCount = 0;
  let presentCount = 0;

  for (const r of attendanceRows || []) {
    const notes = String(r.notes || '');
    const status = String(r.status || '');
    const isAbsent = notes.includes('غياب') || status === 'absent';
    const isLeave = notes.includes('جاز') || notes.includes('إجازة') || status === 'leave';
    const isHalf = notes.includes('نص يوم') || status === 'half_day';

    let rowMinutes = 0;
    if (isAbsent || isLeave) {
      rowMinutes = 0;
    } else if (r.check_in && r.check_out) {
      // Always derive exact worked minutes from check_in/check_out when both exist
      rowMinutes = computeWorkedMinutes(r.check_in, r.check_out);
    } else {
      const storedHours = Number(r.total_hours || 0);
      if (Number.isFinite(storedHours) && storedHours > 0) {
        rowMinutes = storedHours * 60;
      }
    }
    if (Number.isFinite(rowMinutes) && rowMinutes > 0) {
      totalMinutes += rowMinutes;
    }

    if (isAbsent) absentCount += 1;
    if (isLeave) leaveCount += 1;
    if (isHalf) halfDayCount += 1;
    if (!isAbsent && !isLeave && (status === 'present' || status === 'completed' || status === 'late' || rowMinutes > 0 || r.check_in)) {
      presentCount += 1;
    }
  }

  return {
    total_hours: round2(totalMinutes / 60),
    total_minutes: Math.round(totalMinutes),
    formatted_hours: formatHoursAsHHMM(totalMinutes, { isMinutes: true }),
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
  monthlySalesAmount = 0,
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

  const commissionRate = Math.max(0, Number(employee?.commission_rate || 0));
  const monthlySales = Math.max(0, round2(monthlySalesAmount));
  const calcCommissions = commissionRate > 0 ? round2((monthlySales * commissionRate) / 100) : 0;
  const commissionsOverride = numOrNull(adj.commissions);
  const commissions = commissionsOverride !== null ? commissionsOverride : calcCommissions;
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
    actual_minutes: att.total_minutes,
    actual_hours_formatted: att.formatted_hours,
    required_hours: requiredHours,
    overtime_hours: overtimeHours,
    overtime_hours_formatted: formatHoursAsHHMM(overtimeHours),
    overtime_amount: overtimeAmount,
    calc_overtime_amount: calcOvertimeAmount,
    has_overtime_override: overtimeOverride !== null,
    delay_hours: delayHours,
    delay_hours_formatted: formatHoursAsHHMM(delayHours),
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
    calc_commissions: calcCommissions,
    has_commissions_override: commissionsOverride !== null,
    commission_rate: commissionRate,
    monthly_sales: monthlySales,
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
  parseTimeToMinutes,
  normalizeTimeString,
  computeWorkedMinutes,
  computeWorkedHours,
  formatHoursAsHHMM,
  formatTime12HourAmPm,
  computeAttendanceMetrics,
  getPreviousMonthKey,
  getMonthLastDayStr,
  computeDefaultWorkDays,
  computeDefaultAllowedLeaves,
  shouldIncludeEmployeeInMonth,
  summarizeAttendanceRows,
  summarizeTransactionRows,
  calculateEmployeeMonthlyPayroll,
};
