const employeesService = require('./employees.service');

async function getEmployeeOptions(req, res, next) {
  try {
    const data = await employeesService.getEmployeeOptions(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getActiveSellers(req, res, next) {
  try {
    const data = await employeesService.getActiveSellers(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getCheckoutReminders(req, res, next) {
  try {
    const reminders = await employeesService.getCheckoutReminders(req.query.branch_id, req.user);
    res.json({ reminders });
  } catch (err) {
    next(err);
  }
}

async function listEmployees(req, res, next) {
  try {
    const data = await employeesService.listEmployees(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function createEmployee(req, res, next) {
  try {
    const employee = await employeesService.createEmployee(req.body, req.user);
    res.json(employee);
  } catch (err) {
    next(err);
  }
}

async function updateEmployee(req, res, next) {
  try {
    const employee = await employeesService.updateEmployee(req.params.id, req.body, req.user);
    res.json(employee);
  } catch (err) {
    next(err);
  }
}

async function transferEmployee(req, res, next) {
  try {
    const result = await employeesService.transferEmployee(req.params.id, req.body?.branch_id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteEmployee(req, res, next) {
  try {
    const result = await employeesService.deleteEmployee(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function recordAttendance(req, res, next) {
  try {
    const result = await employeesService.recordAttendance(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function toggleAttendance(req, res, next) {
  try {
    const result = await employeesService.toggleAttendance(req.params.id, req.body?.manual_time, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function handleCheckoutReminder(req, res, next) {
  try {
    const result = await employeesService.handleCheckoutReminder(req.params.id, req.body?.attendance_date, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function recordManualAttendance(req, res, next) {
  try {
    const result = await employeesService.recordManualAttendance(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getAttendanceReport(req, res, next) {
  try {
    const result = await employeesService.getAttendanceReport(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createEmployeeTransaction(req, res, next) {
  try {
    const result = await employeesService.createEmployeeTransaction(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getEmployeeSummary(req, res, next) {
  try {
    const result = await employeesService.getEmployeeSummary(req.params.id, req.query.month, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getEmployeePayslip(req, res, next) {
  try {
    const result = await employeesService.getEmployeePayslip(req.params.id, req.query.month, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getEmployeeSalesReport(req, res, next) {
  try {
    const result = await employeesService.getEmployeeSalesReport(req.params.id, req.query, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getEmployeeOptions,
  getActiveSellers,
  getCheckoutReminders,
  listEmployees,
  createEmployee,
  updateEmployee,
  transferEmployee,
  deleteEmployee,
  recordAttendance,
  toggleAttendance,
  handleCheckoutReminder,
  recordManualAttendance,
  getAttendanceReport,
  createEmployeeTransaction,
  getEmployeeSummary,
  getEmployeePayslip,
  getEmployeeSalesReport,
};
