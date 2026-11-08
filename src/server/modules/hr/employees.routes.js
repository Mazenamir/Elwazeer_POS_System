const express = require('express');
const router = express.Router();
const employeesController = require('./employees.controller');
const { requirePermission } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../../shared/constants/permissions');
const authService = require('../auth/auth.service');

// Employees options, active sellers, and checkout reminders
router.get(
  '/employees/active-sellers',
  requirePermission(
    'employees.list.view',
    'pos.sales.view',
    'pos.sales.create',
    'rentals.contracts.create',
    'tailoring.create',
    'alterations.create'
  ),
  employeesController.getActiveSellers
);
router.get(
  '/employees/options',
  requirePermission(
    'employees.list.view',
    'pos.sales.view',
    'pos.sales.create',
    'rentals.contracts.create',
    'tailoring.create',
    'alterations.create'
  ),
  employeesController.getEmployeeOptions
);
router.get(
  '/employees/checkout-reminders',
  requirePermission('employees.attendance.view', 'employees.attendance.edit'),
  employeesController.getCheckoutReminders
);

// Employees CRUD & Transfer
router.get('/employees', requirePermission('employees.list.view'), employeesController.listEmployees);
router.post('/employees', requirePermission('employees.create'), employeesController.createEmployee);
router.put('/employees/:id', requirePermission('employees.edit'), employeesController.updateEmployee);
router.post('/employees/:id/transfer', requirePermission('employees.edit'), employeesController.transferEmployee);
router.delete('/employees/:id', requirePermission('employees.edit'), employeesController.deleteEmployee);

// Attendance endpoints
router.post('/attendance', requirePermission('employees.attendance.edit'), employeesController.recordAttendance);
router.post('/employees/:id/attendance-toggle', requirePermission('employees.attendance.edit'), employeesController.toggleAttendance);
router.post('/employees/:id/checkout-reminder', requirePermission('employees.attendance.edit'), employeesController.handleCheckoutReminder);
router.post('/employees/:id/attendance-manual', requirePermission('employees.attendance.edit'), employeesController.recordManualAttendance);
router.get('/employees/:id/attendance-report', requirePermission('employees.attendance.view', 'employees.attendance.edit'), employeesController.getAttendanceReport);

// Employee transactions (advances, deductions, salary payments, bonuses)
function requireTransactionPermission(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role === 'admin') {
    return next();
  }
  const type = req.body?.type;
  if (type === 'advance') {
    if (hasPermission(req.user, 'employees.advances.create')) {
      return next();
    }
  } else {
    if (hasPermission(req.user, 'employees.payroll.execute')) {
      return next();
    }
  }
  return res.status(403).json({ error: 'Forbidden' });
}
router.post('/employee_transactions', requireTransactionPermission, employeesController.createEmployeeTransaction);

async function requireSalaryAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const isPayslip = (req.route?.path && req.route.path.includes('payslip')) || (req.path && req.path.includes('payslip'));
  const hasAccess = isPayslip
    ? hasPermission(req.user, 'employees.payroll.view')
    : (hasPermission(req.user, 'employees.payroll.view') || hasPermission(req.user, 'employees.advances.create'));
  if (req.user.role !== 'admin' && !hasAccess) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.user.role === 'admin') {
    return next();
  }
  const password = req.headers['x-salary-password'] || req.query.salary_password;
  if (!password) {
    return res.status(403).json({ error: 'كلمة سر الرواتب مطلوبة للاطلاع على هذا التقرير' });
  }
  const isValid = await authService.verifySalaryPassword(password);
  if (!isValid) {
    return res.status(403).json({ error: 'كلمة سر الرواتب غير صحيحة' });
  }
  next();
}

// Summary, Payslip, and Sales Report
router.get('/employees/:id/summary', requireSalaryAccess, employeesController.getEmployeeSummary);
router.get('/employees/:id/payslip', requireSalaryAccess, employeesController.getEmployeePayslip);
router.get('/employees/:id/sales-report', requirePermission('employees.list.view', 'reports.sales.view'), employeesController.getEmployeeSalesReport);

module.exports = router;
