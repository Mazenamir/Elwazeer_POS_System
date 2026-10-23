const assert = require('assert');
const db = require('../src/server/database/connection');
const reportsService = require('../src/server/modules/reports/reports.service');
const employeesService = require('../src/server/modules/hr/employees.service');

async function runInvariantsTests() {
  console.log('================================================================');
  console.log('   ELWAZEER POS — CASH DRAWER & PAYROLL INVARIANTS TEST SUITE   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passed++;
      } catch (err) {
        console.log(`  ❌ [FAIL] ${name}: ${err.message}`);
        failed++;
      }
    })();
  }

  // 1. Cash Drawer Settlement: Separation of Visa/Instapay and Deduction of Advances & Cash Expenses
  await test('FIN-01: Cash drawer isolates physical cash from Visa/Instapay and deducts advances', async () => {
    const report = await reportsService.getExtendedDailyReport({ date: '2026-10-22' }, { role: 'admin' });
    assert.ok(report, 'Extended daily report must return data');
    const summary = report.summary;

    assert.ok('cash_collected' in summary, 'Summary must record cash_collected');
    assert.ok('cash_expenses' in summary, 'Summary must record cash_expenses');
    assert.ok('total_advances' in summary, 'Summary must record total_advances');
    assert.ok('physical_cash_in_drawer' in summary, 'Summary must record physical_cash_in_drawer');

    // Rule: physical_cash_in_drawer = max(0, cash_collected - cash_expenses - total_advances)
    const expectedPhysical = Math.max(0, summary.cash_collected - summary.cash_expenses - summary.total_advances);
    assert.strictEqual(
      summary.physical_cash_in_drawer,
      expectedPhysical,
      `physical_cash_in_drawer (${summary.physical_cash_in_drawer}) must match expected (${expectedPhysical})`
    );
    assert.strictEqual(summary.cash_in_drawer, expectedPhysical, 'cash_in_drawer must match physical_cash_in_drawer for safe drawer deposit');
  });

  // 2. Profit Report Cash Drawer Settlement
  await test('FIN-02: Profit report cash_drawer deducts employee advances across branches', async () => {
    const profitReport = await reportsService.getProfitReport({ startDate: '2026-10-01', endDate: '2026-10-23' }, { role: 'admin' });
    assert.ok(profitReport && profitReport.summary, 'Profit report must return summary');
    const summary = profitReport.summary;

    assert.ok('physical_cash_in_drawer' in summary);
    assert.strictEqual(summary.cash_in_drawer, summary.physical_cash_in_drawer, 'summary.cash_in_drawer must equal physical_cash_in_drawer');
  });

  // 3. Monthly Payroll Invariants Verification
  await test('PAYROLL-01: Monthly salary sheet implements 268h standard, double absence, 4 free leaves, and 1.35x overtime', async () => {
    const salarySheet = await reportsService.getMonthlySalarySheet({ month: '2026-10' }, { role: 'admin' });
    const employeesList = salarySheet.employees || salarySheet.salary_sheet;
    assert.ok(Array.isArray(employeesList), 'Salary sheet employees must be an array');
    
    for (const emp of employeesList) {
      assert.strictEqual(emp.required_hours, 268, 'Standard monthly required hours must strictly be 268');
      
      const expectedDaily = Math.round((emp.basic_salary / 30) * 100) / 100;
      assert.strictEqual(emp.daily_rate, expectedDaily, 'Daily rate must be basic_salary / 30');

      const expectedOvertime = Math.round(((emp.daily_rate / 10) * 1.35) * emp.overtime_hours);
      assert.strictEqual(emp.overtime_amount, expectedOvertime, 'Overtime must equal ((daily/10)*1.35)*overtime_hours');

      const expectedAbsentDeduction = Math.round(emp.absent_days * emp.daily_rate * 2);
      assert.strictEqual(emp.absent_deduction, expectedAbsentDeduction, 'Absence must carry double penalty deduction');

      const expectedLeaveDeduction = Math.round(Math.max(0, emp.leave_days - 4) * emp.daily_rate);
      assert.strictEqual(emp.leave_deduction, expectedLeaveDeduction, 'First 4 leave days must be free, excess deducted at daily rate');

      const expectedHalfDayDeduction = Math.round(emp.half_days * (emp.daily_rate / 2));
      assert.strictEqual(emp.half_day_deduction, expectedHalfDayDeduction, 'Half days deducted at daily/2');

      const expectedDelayDeduction = Math.round(emp.delay_hours * (emp.daily_rate / 10));
      assert.strictEqual(emp.delay_deduction, expectedDelayDeduction, 'Delay hours deducted at daily/10');
    }
  });

  // 4. Parity Between getMonthlySalarySheet and getEmployeePayslip
  await test('PAYROLL-02: Parity between getMonthlySalarySheet and getEmployeePayslip formulas', async () => {
    // Pick first active employee
    const empRes = await db.query("SELECT id FROM employees WHERE status = 'active' LIMIT 1");
    if (empRes.rows.length === 0) return;
    const testEmpId = empRes.rows[0].id;

    const payslip = await employeesService.getEmployeePayslip(testEmpId, '2026-10', { role: 'admin' });
    assert.ok(payslip, 'Payslip must return data');
    assert.ok('basic_salary' in payslip, 'Payslip must contain basic_salary');
    assert.ok('net_salary' in payslip, 'Payslip must contain net_salary at top level');
    assert.ok('bonuses' in payslip, 'Payslip must contain bonuses at top level');
    assert.ok('deductions' in payslip, 'Payslip must contain deductions at top level');
    assert.ok('advances' in payslip, 'Payslip must contain advances at top level');

    const att = payslip.attendance;
    const dailyRate = Math.round((payslip.basic_salary / 30) * 100) / 100;
    const expectedAbsent = Math.round(att.absent_days * dailyRate * 2);
    assert.strictEqual(att.absence_deduction, expectedAbsent, 'Payslip absence deduction must follow double penalty');

    const expectedLeave = Math.round(Math.max(0, att.leave_days - 4) * dailyRate);
    assert.strictEqual(att.leave_deduction, expectedLeave, 'Payslip leave deduction must respect 4 allowed days');
  });

  console.log('\n================================================================');
  console.log(`CASH DRAWER & PAYROLL SUMMARY: ${passed}/${passed + failed} Tests Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runInvariantsTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
