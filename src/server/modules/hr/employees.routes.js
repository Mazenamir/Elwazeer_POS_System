const express = require('express');
const router = express.Router();
const employeesController = require('./employees.controller');
const { requirePermission } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../../shared/constants/permissions');
const authService = require('../auth/auth.service');

// Employees options, active sellers, and checkout reminders
router.get('/employees/active-sellers', requirePermission('index.html', 'Rentals.html', 'Tailoring.html', 'Alterations.html', 'Employees.html'), employeesController.getActiveSellers);
router.get('/employees/options', requirePermission('index.html', 'Rentals.html', 'Tailoring.html', 'Alterations.html', 'Employees.html'), employeesController.getEmployeeOptions);
router.get('/employees/checkout-reminders', requirePermission('Employees.html'), employeesController.getCheckoutReminders);

// Employees CRUD & Transfer
router.get('/employees', requirePermission('Employees.html'), employeesController.listEmployees);
router.post('/employees', requirePermission('Employees.html'), employeesController.createEmployee);
router.put('/employees/:id', requirePermission('Employees.html'), employeesController.updateEmployee);
router.post('/employees/:id/transfer', requirePermission('Employees.html'), employeesController.transferEmployee);
router.delete('/employees/:id', requirePermission('Employees.html'), employeesController.deleteEmployee);

// Attendance endpoints
router.post('/attendance', requirePermission('Employees.html'), employeesController.recordAttendance);
router.post('/employees/:id/attendance-toggle', requirePermission('Employees.html'), employeesController.toggleAttendance);
router.post('/employees/:id/checkout-reminder', requirePermission('Employees.html'), employeesController.handleCheckoutReminder);
router.post('/employees/:id/attendance-manual', requirePermission('Employees.html'), employeesController.recordManualAttendance);
router.get('/employees/:id/attendance-report', requirePermission('Employees.html'), employeesController.getAttendanceReport);

// Employee transactions (advances, deductions, salary payments, bonuses)
router.post('/employee_transactions', requirePermission('Employees.html'), employeesController.createEmployeeTransaction);

async function requireSalaryAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin' && !hasPermission(req.user, 'Employees.html')) {
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
router.get('/employees/:id/sales-report', requirePermission('Employees.html'), employeesController.getEmployeeSalesReport);

module.exports = router;
