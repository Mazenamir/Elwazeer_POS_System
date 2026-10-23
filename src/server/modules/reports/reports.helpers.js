const { hasInventoryAdminAccess } = require('../../../shared/constants/permissions');
const { getCairoDateTimeParts, addDays, getMonthRange } = require('../../../shared/utils/date');

function getReportBranchId(user, query = {}) {
  if (user && user.role !== 'admin') {
    if (!user.branch_id) {
      const err = new Error('Branch user must have a branch_id');
      err.statusCode = 403;
      err.status = 403;
      throw err;
    }
    if (query.branch_id === 'all') {
      const err = new Error('Forbidden: Only administrators can view consolidated multi-branch reports');
      err.statusCode = 403;
      err.status = 403;
      throw err;
    }
    if (query.branch_id && String(query.branch_id) !== String(user.branch_id)) {
      const err = new Error('Forbidden: Cannot access other branch reports');
      err.statusCode = 403;
      err.status = 403;
      throw err;
    }
    return String(user.branch_id);
  }
  if (query.branch_id && query.branch_id !== 'all') {
    return String(query.branch_id);
  }
  return null;
}

function canViewReportProfit(user) {
  return hasInventoryAdminAccess(user);
}

function stripReportProfit(row) {
  const { net_profit, profit, cogs, total_inventory_value, today_profit, month_profit, ...rest } = row || {};
  return rest;
}

function employeeTransactionReportAmountSql(alias = 'et') {
  return `CASE
    WHEN ${alias}.type IN ('salary_payment', 'advance', 'bonus') THEN COALESCE(${alias}.amount, 0)
    WHEN ${alias}.type = 'deduction' THEN -COALESCE(${alias}.amount, 0)
    ELSE 0
  END`;
}

function employeeTransactionRemainingDeltaSql(alias = 'et') {
  return `CASE
    WHEN ${alias}.type = 'bonus' THEN -COALESCE(${alias}.amount, 0)
    WHEN ${alias}.type IN ('salary_payment', 'advance', 'deduction') THEN COALESCE(${alias}.amount, 0)
    ELSE 0
  END`;
}

function normalizePaymentMethod(raw) {
  const norm = String(raw || 'cash').toLowerCase().trim();
  if (['cash', 'نقدي', 'كاش', 'نقدي (كاش)', 'كاش (بالدرج)'].includes(norm)) return 'cash';
  if (['visa', 'card', 'credit', 'بطاقة', 'فيزا', 'بطاقة (فيزا)', 'فيزا / بطاقة', 'فيزا / بطاقات'].includes(norm)) return 'card';
  if (['bank_transfer', 'bank', 'transfer', 'instapay', 'انستاباي', 'تحويل بنكي', 'تحويل', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي'].includes(norm)) return 'bank_transfer';
  if (['wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة'].includes(norm)) return 'wallet';
  if (['split', 'مجزأ', 'mixed', 'دفع مجزأ'].includes(norm)) return 'split';
  if (['debt', 'credit_customer', 'آجل', 'آجل / مديونية'].includes(norm)) return 'debt';
  return 'cash';
}

function normalizedPaymentMethodSql(column = 'payment_method') {
  const normCol = `LOWER(TRIM(COALESCE(${column}::text, 'cash')))`;
  return `CASE
    WHEN ${normCol} IN ('cash', 'نقدي', 'كاش', 'نقدي (كاش)', 'كاش (بالدرج)') THEN 'cash'
    WHEN ${normCol} IN ('visa', 'card', 'credit', 'بطاقة', 'فيزا', 'بطاقة (فيزا)', 'فيزا / بطاقة', 'فيزا / بطاقات') THEN 'visa'
    WHEN ${normCol} IN ('wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة') THEN 'wallet'
    WHEN ${normCol} IN ('bank_transfer', 'bank', 'transfer', 'انستاباي', 'instapay', 'تحويل بنكي', 'تحويل', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي') THEN 'bank_transfer'
    WHEN ${normCol} IN ('split', 'مجزأ', 'mixed', 'دفع مجزأ') THEN 'split'
    WHEN ${normCol} IN ('debt', 'credit_customer', 'آجل', 'آجل / مديونية') THEN 'debt'
    ELSE 'cash'
  END`;
}

function rowsByBranch(rows, valueMapper = row => row) {
  return new Map((rows || []).map(row => [Number(row.branch_id), valueMapper(row)]));
}

function getDayRange(dateKey) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? dateKey : getCairoDateTimeParts().date;
  return { start: safeDate, end: addDays(safeDate, 1) };
}

function parseReportDateRange(query = {}) {
  const cairoNow = getCairoDateTimeParts();
  const dateFrom = query.date_from || query.from;
  const dateTo = query.date_to || query.to;

  const validFrom = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom);
  const validTo = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo);

  if (validFrom || validTo) {
    let start = validFrom ? dateFrom : dateTo;
    let endDay = validTo ? dateTo : dateFrom;
    if (start > endDay) {
      const temp = start;
      start = endDay;
      endDay = temp;
    }
    return {
      start,
      end: addDays(endDay, 1),
      dateFrom: start,
      dateTo: endDay,
      label: start === endDay ? start : `${start} إلى ${endDay}`,
      isCustomRange: true,
    };
  }

  if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    return {
      date: query.date,
      start: query.date,
      end: addDays(query.date, 1),
      dateFrom: query.date,
      dateTo: query.date,
      label: query.date,
      isCustomRange: false,
    };
  }

  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    const [, mStr] = query.month.split('-');
    const mNum = Number(mStr);
    if (mNum >= 1 && mNum <= 12) {
      const mRange = getMonthRange(query.month);
      return {
        start: mRange.start,
        end: mRange.end,
        month: query.month,
        dateFrom: mRange.start,
        dateTo: addDays(mRange.end, -1),
        label: query.month,
        isCustomRange: false,
      };
    }
  }

  // Default to current month
  const cairoDate = cairoNow?.date || new Date().toISOString().slice(0, 10);
  const currentMonth = cairoDate.slice(0, 7);
  const mRange = getMonthRange(currentMonth);
  return {
    start: mRange.start,
    end: mRange.end,
    month: currentMonth,
    dateFrom: mRange.start,
    dateTo: addDays(mRange.end, -1),
    label: currentMonth,
    isCustomRange: false,
  };
}

function sanitizeFormulaValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' && val.length > 0) {
    const firstChar = val.charAt(0);
    if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
      return `'${val}`;
    }
  }
  return val;
}

function formatCairoDateTime(date = new Date()) {
  try {
    return new Date(date).toLocaleString('ar-EG', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date(date).toISOString();
  }
}

module.exports = {
  getReportBranchId,
  canViewReportProfit,
  stripReportProfit,
  employeeTransactionReportAmountSql,
  employeeTransactionRemainingDeltaSql,
  normalizePaymentMethod,
  normalizedPaymentMethodSql,
  rowsByBranch,
  getDayRange,
  parseReportDateRange,
  sanitizeFormulaValue,
  formatCairoDateTime,
};

