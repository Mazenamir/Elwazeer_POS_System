const { hasInventoryAdminAccess } = require('../../../shared/constants/permissions');
const { getCairoDateTimeParts, addDays } = require('../../../shared/utils/date');

function getReportBranchId(user, query = {}) {
  if (user && user.role !== 'admin') {
    return user.branch_id ? String(user.branch_id) : null;
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
  const { net_profit, profit, cogs, total_inventory_value, ...rest } = row || {};
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

function normalizedPaymentMethodSql(column = 'payment_method') {
  return `CASE
    WHEN COALESCE(${column}, 'cash') IN ('cash', 'نقدي') THEN 'cash'
    WHEN COALESCE(${column}, 'cash') IN ('visa', 'card') THEN 'visa'
    WHEN COALESCE(${column}, 'cash') IN ('wallet', 'mobile_wallet') THEN 'wallet'
    WHEN COALESCE(${column}, 'cash') IN ('bank_transfer', 'bank', 'transfer') THEN 'bank_transfer'
    ELSE COALESCE(${column}, 'cash')
  END`;
}

function rowsByBranch(rows, valueMapper = row => row) {
  return new Map((rows || []).map(row => [Number(row.branch_id), valueMapper(row)]));
}

function getDayRange(dateKey) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? dateKey : getCairoDateTimeParts().date;
  return { start: safeDate, end: addDays(safeDate, 1) };
}

module.exports = {
  getReportBranchId,
  canViewReportProfit,
  stripReportProfit,
  employeeTransactionReportAmountSql,
  employeeTransactionRemainingDeltaSql,
  normalizedPaymentMethodSql,
  rowsByBranch,
  getDayRange,
};
