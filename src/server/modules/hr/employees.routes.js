const express = require('express');
const router = express.Router();
const employeesController = require('./employees.controller');

// Employees options and checkout reminders
router.get('/employees/options', employeesController.getEmployeeOptions);
router.get('/employees/checkout-reminders', employeesController.getCheckoutReminders);

// Employees CRUD & Transfer
router.get('/employees', employeesController.listEmployees);
router.post('/employees', employeesController.createEmployee);
router.put('/employees/:id', employeesController.updateEmployee);
router.post('/employees/:id/transfer', employeesController.transferEmployee);
router.delete('/employees/:id', employeesController.deleteEmployee);

// Attendance endpoints
router.post('/attendance', employeesController.recordAttendance);
router.post('/employees/:id/attendance-toggle', employeesController.toggleAttendance);
router.post('/employees/:id/checkout-reminder', employeesController.handleCheckoutReminder);
router.post('/employees/:id/attendance-manual', employeesController.recordManualAttendance);
router.get('/employees/:id/attendance-report', employeesController.getAttendanceReport);

// Employee transactions (advances, deductions, salary payments, bonuses)
router.post('/employee_transactions', employeesController.createEmployeeTransaction);

const authService = require('../auth/auth.service');

async function requireSalaryAccess(req, res, next) {
  if (req.user && req.user.role === 'admin') {
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
router.get('/employees/:id/sales-report', employeesController.getEmployeeSalesReport);

module.exports = router;
