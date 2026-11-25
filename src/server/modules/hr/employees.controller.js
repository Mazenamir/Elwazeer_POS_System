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
    const targetBranchId = req.body?.branch_id ?? req.body?.target_branch_id;
    const result = await employeesService.transferEmployee(req.params.id, targetBranchId, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deactivateEmployee(req, res, next) {
  try {
    const result = await employeesService.deactivateEmployee(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteEmployee(req, res, next) {
  try {
    const result = await employeesService.deleteEmployee(req.params.id, req.user, {
      end_date: req.query?.end_date || req.body?.end_date,
      force_hard_delete: req.query?.force === 'true' || req.body?.force_hard_delete === true,
    });
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
    const result = await employeesService.toggleAttendance(req.params.id, req.body?.manual_time, req.user, req.body?.branch_id);
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

async function deleteEmployeeTransaction(req, res, next) {
  try {
    const result = await employeesService.deleteEmployeeTransaction(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getEmployeeSummary(req, res, next) {
  try {
    const userWithAccess = {
      ...req.user,
      salaryAccessVerified: Boolean(req.salaryAccessVerified),
    };
    const options = {
      type: req.query.type,
      advanceOnly: req.query.type === 'advance' || req.query.advance_only === 'true',
    };
    const result = await employeesService.getEmployeeSummary(req.params.id, req.query.month, userWithAccess, options);
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

async function saveEmployeePayrollAdjustment(req, res, next) {
  try {
    const result = await employeesService.saveEmployeePayrollAdjustment(req.params.id, req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function setBulkMonthlyRequiredHours(req, res, next) {
  try {
    const result = await employeesService.setBulkMonthlyRequiredHours(req.body, req.user);
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
  deactivateEmployee,
  deleteEmployee,
  recordAttendance,
  toggleAttendance,
  handleCheckoutReminder,
  recordManualAttendance,
  getAttendanceReport,
  createEmployeeTransaction,
  deleteEmployeeTransaction,
  getEmployeeSummary,
  getEmployeePayslip,
  saveEmployeePayrollAdjustment,
  setBulkMonthlyRequiredHours,
  getEmployeeSalesReport,
};
