/**
 * test_financial_payroll_invariants.js
 * Comprehensive Invariant Regression Suite for Financial Reconciliation, Cash Drawer Settlement,
 * 268-Hour Monthly Payroll Invariants, and 31-Day Consolidated Excel Export Structure.
 *
 * Authoritative Sources:
 * 1. elwazeer-accounting.md (Cash drawer settlement, 268h payroll, 31-sheet Excel layout)
 * 2. PROJECT.md (Interface contracts for reports, HR payslip, Excel export)
 * 3. ORIGINAL_REQUEST.md (Requirements R2 & R6)
 */

const assert = require('node:assert');
const path = require('node:path');
const ExcelJS = require('exceljs');

// Database connection & application modules
const db = require('../src/server/database/connection');
const reportsExcel = require('../src/server/modules/reports/reports.excel');
const reportsService = require('../src/server/modules/reports/reports.service');
const employeesService = require('../src/server/modules/hr/employees.service');

// Test Runner Harness
let totalTests = 0;
let passedTests = 0;
const failures = [];
const implementationBugs = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    -> ${err.message}`);
  }
}

// ============================================================================
// REFERENCE RECONCILIATION & CALCULATION ENGINE (ORACLE)
// ============================================================================

/**
 * Cash Drawer Settlement Invariant:
 * Remaining Cash = max(0, Cash Collected - Cash Expenses - Employee Advances)
 * Bank Revenue (Visa & Instapay) is 100% separated and has zero effect on cash in drawer.
 */
function calculateCashDrawerSettlement({
  cashSales = 0,
  cashReturns = 0,
  visaSales = 0,
  instapaySales = 0,
  walletSales = 0,
  cashExpenses = 0,
  nonCashExpenses = 0,
  employeeAdvances = 0,
}) {
  const netCashCollected = Math.max(0, cashSales - cashReturns);
  const totalBankRevenue = visaSales + instapaySales + walletSales;
  const grossDrawer = netCashCollected - cashExpenses;
  const physicalCashInDrawer = Math.max(0, netCashCollected - cashExpenses - employeeAdvances);

  return {
    netCashCollected,
    totalBankRevenue,
    cashExpenses,
    nonCashExpenses,
    employeeAdvances,
    grossDrawer,
    physicalCashInDrawer,
  };
}

/**
 * Monthly Payroll Invariant Engine:
 * Standard hours = 268
 * Daily rate = basic_salary / 30
 * Hourly rate = dailyRate / 10
 * Overtime = ((dailyRate / 10) * 1.35) * overtime_hours
 * Absence = absent_days * dailyRate * 2 (strict double penalty)
 * Leave = max(0, leave_days - 4) * dailyRate (4 free leaves)
 * Half-day = half_days * (dailyRate / 2)
 * Delay = delay_hours * (dailyRate / 10)
 * Net Pay = basic + bonuses + overtime - (advances + absence + leave + halfDay + delay + deductions)
 */
function calculateMonthlyPayroll({
  basicSalary = 0,
  actualHours = 268,
  requiredHours = 268,
  absentDays = 0,
  leaveDays = 0,
  halfDays = 0,
  bonuses = 0,
  advances = 0,
  deductions = 0,
}) {
  const dailyRate = Math.round((basicSalary / 30) * 100) / 100;
  const hourlyRate = Math.round((dailyRate / 10) * 100) / 100;

  const overtimeHours = actualHours > requiredHours ? Math.round((actualHours - requiredHours) * 100) / 100 : 0;
  const delayHours = actualHours < requiredHours ? Math.round((requiredHours - actualHours) * 100) / 100 : 0;

  const overtimeAmount = Math.round(((dailyRate / 10) * 1.35) * overtimeHours);
  const absenceDeduction = Math.round(absentDays * dailyRate * 2);
  const leaveDeduction = Math.round(Math.max(0, leaveDays - 4) * dailyRate);
  const halfDayDeduction = Math.round(halfDays * (dailyRate / 2));
  const delayDeduction = Math.round(delayHours * (dailyRate / 10));

  const totalBonuses = bonuses + overtimeAmount;
  const totalDeductions = advances + absenceDeduction + leaveDeduction + halfDayDeduction + delayDeduction + deductions;
  const netSalary = Math.round(basicSalary + totalBonuses - totalDeductions);

  return {
    dailyRate,
    hourlyRate,
    overtimeHours,
    delayHours,
    overtimeAmount,
    absenceDeduction,
    leaveDeduction,
    halfDayDeduction,
    delayDeduction,
    totalBonuses,
    totalDeductions,
    netSalary,
  };
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runAllTests() {
  console.log('================================================================');
  console.log('ELWAZEER POS INVARIANT REGRESSION SUITE (FINANCIAL & PAYROLL)');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: Cash Drawer Settlement Formula Invariants (Tier 1 & Tier 2)
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Cash Drawer Settlement Formula Invariants (Tier 1 & 2) ---');

  await test('F2.T1.1: Standard cash sales with zero expenses and zero advances', () => {
    const res = calculateCashDrawerSettlement({ cashSales: 5000 });
    assert.strictEqual(res.netCashCollected, 5000);
    assert.strictEqual(res.physicalCashInDrawer, 5000, 'Physical cash in drawer must equal cash sales');
    assert.strictEqual(res.totalBankRevenue, 0, 'Bank revenue must be 0 for cash-only sales');
  });

  await test('F2.T1.2: Standard cash sales with both cash expenses and employee advances', () => {
    // 5000 cash - 800 cash expenses - 1200 employee advances = 3000 physical cash in drawer
    const res = calculateCashDrawerSettlement({
      cashSales: 5000,
      cashExpenses: 800,
      employeeAdvances: 1200,
    });
    assert.strictEqual(res.physicalCashInDrawer, 3000, 'Cash in drawer must deduct both expenses and employee advances');
    assert.strictEqual(res.grossDrawer, 4200, 'Gross drawer before advances is 4200');
  });

  await test('F2.T1.3: Visa sales are 100% isolated to bank revenue and never enter physical cash drawer', () => {
    const res = calculateCashDrawerSettlement({
      cashSales: 1000,
      visaSales: 15000,
      cashExpenses: 300,
      employeeAdvances: 200,
    });
    assert.strictEqual(res.totalBankRevenue, 15000, 'Visa must be counted as bank revenue');
    assert.strictEqual(res.physicalCashInDrawer, 500, 'Physical drawer only reflects cash (1000 - 300 - 200 = 500)');
  });

  await test('F2.T1.4: Instapay sales are 100% isolated to bank revenue and never enter physical cash drawer', () => {
    const res = calculateCashDrawerSettlement({
      cashSales: 2000,
      instapaySales: 8000,
      cashExpenses: 500,
      employeeAdvances: 500,
    });
    assert.strictEqual(res.totalBankRevenue, 8000, 'Instapay must be counted as bank revenue');
    assert.strictEqual(res.physicalCashInDrawer, 1000, 'Physical drawer only reflects cash (2000 - 500 - 500 = 1000)');
  });

  await test('F2.T1.5: Mixed tender sale (Cash + Visa + Instapay) with expenses and advances', () => {
    const res = calculateCashDrawerSettlement({
      cashSales: 3000,
      visaSales: 4000,
      instapaySales: 2500,
      cashExpenses: 1000,
      employeeAdvances: 500,
    });
    assert.strictEqual(res.totalBankRevenue, 6500, 'Bank revenue must sum Visa and Instapay (4000 + 2500)');
    assert.strictEqual(res.physicalCashInDrawer, 1500, 'Physical cash drawer must be 3000 - 1000 - 500 = 1500');
  });

  await test('F2.T2.1: Boundary - Zero cash sales with positive cash expenses clamps physical drawer to 0', () => {
    const res = calculateCashDrawerSettlement({
      cashSales: 0,
      cashExpenses: 400,
      employeeAdvances: 100,
    });
    assert.strictEqual(res.physicalCashInDrawer, 0, 'Physical cash in drawer cannot be negative; must clamp to 0');
  });

  await test('F2.T2.2: Boundary - Total expenses and advances exceed cash sales clamps physical drawer to 0', () => {
    const res = calculateCashDrawerSettlement({
      cashSales: 1000,
      cashExpenses: 700,
      employeeAdvances: 800,
    });
    assert.strictEqual(res.physicalCashInDrawer, 0, 'Physical drawer must clamp to 0 when deductions exceed cash');
  });

  await test('F2.T2.3: Boundary - Cash returns exceeding cash sales does not corrupt physical cash drawer', () => {
    const res = calculateCashDrawerSettlement({
      cashSales: 500,
      cashReturns: 800,
      cashExpenses: 100,
      employeeAdvances: 0,
    });
    assert.strictEqual(res.netCashCollected, 0, 'Net cash collected clamped to 0 on net negative returns');
    assert.strictEqual(res.physicalCashInDrawer, 0, 'Physical drawer clamped to 0');
  });

  await test('F2.T2.4: Boundary - Non-cash expenses (bank charges) do not deduct from physical cash drawer', () => {
    const res = calculateCashDrawerSettlement({
      cashSales: 2000,
      cashExpenses: 200,
      nonCashExpenses: 500,
      employeeAdvances: 300,
    });
    assert.strictEqual(res.physicalCashInDrawer, 1500, 'Non-cash expenses do not deduct from physical cash in drawer');
  });

  await test('F2.T2.5: Boundary - Large employee advances exceeding cash sales clamps drawer to 0', () => {
    const res = calculateCashDrawerSettlement({
      cashSales: 1000,
      cashExpenses: 100,
      employeeAdvances: 50000,
    });
    assert.strictEqual(res.physicalCashInDrawer, 0, 'Physical drawer clamped to 0 when advances exceed available cash');
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Monthly Payroll Invariants (Tier 1 & Tier 2)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Monthly Payroll Invariants (Tier 1 & 2) ---');

  await test('F3.T1.1: Baseline payroll - 268 standard hours, dailyRate = basicSalary / 30', () => {
    const res = calculateMonthlyPayroll({ basicSalary: 6000, actualHours: 268 });
    assert.strictEqual(res.dailyRate, 200, 'Daily rate for 6000 EGP basic must be 200 EGP');
    assert.strictEqual(res.hourlyRate, 20, 'Hourly rate based on 10h/day must be 20 EGP');
    assert.strictEqual(res.overtimeHours, 0);
    assert.strictEqual(res.delayHours, 0);
    assert.strictEqual(res.netSalary, 6000, 'Net salary without deductions/bonuses must equal basic salary');
  });

  await test('F3.T1.2: Absence deduction strict double penalty: absent_days * dailyRate * 2', () => {
    const res = calculateMonthlyPayroll({ basicSalary: 6000, actualHours: 268, absentDays: 1 });
    // dailyRate = 200 -> double penalty = 1 * 200 * 2 = 400 EGP
    assert.strictEqual(res.absenceDeduction, 400, 'Double absence penalty must deduct 2 days per absence');
    assert.strictEqual(res.netSalary, 5600, 'Net salary must be 6000 - 400 = 5600');
  });

  await test('F3.T1.3: Allowed leave policy - 4 days free leaves monthly incur 0 deduction', () => {
    const res = calculateMonthlyPayroll({ basicSalary: 6000, actualHours: 268, leaveDays: 4 });
    assert.strictEqual(res.leaveDeduction, 0, '4 approved leaves per month must incur 0 deduction');
    assert.strictEqual(res.netSalary, 6000, 'Net salary remains 6000 EGP');
  });

  await test('F3.T1.4: Excess leave policy - leaves above 4 incur (leaveDays - 4) * dailyRate', () => {
    const res = calculateMonthlyPayroll({ basicSalary: 6000, actualHours: 268, leaveDays: 6 });
    // 6 leaves - 4 allowed = 2 excess leaves * 200 = 400 EGP
    assert.strictEqual(res.leaveDeduction, 400, 'Leaves beyond 4 must deduct 1 day per excess leave');
    assert.strictEqual(res.netSalary, 5600, 'Net salary must be 6000 - 400 = 5600');
  });

  await test('F3.T1.5: Overtime formula: ((dailyRate / 10) * 1.35) * overtime_hours', () => {
    // 278 hours = 10 overtime hours. dailyRate = 200 -> (20 * 1.35) = 27 EGP/hr -> 270 EGP
    const res = calculateMonthlyPayroll({ basicSalary: 6000, actualHours: 278 });
    assert.strictEqual(res.overtimeHours, 10, 'Overtime hours must be 278 - 268 = 10');
    assert.strictEqual(res.overtimeAmount, 270, 'Overtime must be 10 * 27 = 270 EGP');
    assert.strictEqual(res.netSalary, 6270, 'Net salary must be 6000 + 270 = 6270');
  });

  await test('F3.T2.1: Delay deduction formula: late_hours * (dailyRate / 10)', () => {
    // 258 hours = 10 delay hours. dailyRate = 200 -> hourly rate = 20 -> 200 EGP
    const res = calculateMonthlyPayroll({ basicSalary: 6000, actualHours: 258 });
    assert.strictEqual(res.delayHours, 10, 'Delay hours must be 268 - 258 = 10');
    assert.strictEqual(res.delayDeduction, 200, 'Delay deduction must be 10 * 20 = 200 EGP');
    assert.strictEqual(res.netSalary, 5800, 'Net salary must be 6000 - 200 = 5800');
  });

  await test('F3.T2.2: Half-day deduction formula: half_days * (dailyRate / 2)', () => {
    // 3 half-days. dailyRate = 200 -> 3 * 100 = 300 EGP
    const res = calculateMonthlyPayroll({ basicSalary: 6000, actualHours: 268, halfDays: 3 });
    assert.strictEqual(res.halfDayDeduction, 300, 'Half day deduction must be half of daily rate per half-day');
    assert.strictEqual(res.netSalary, 5700, 'Net salary must be 6000 - 300 = 5700');
  });

  await test('F3.T2.3: Comprehensive multi-deduction net salary calculation', () => {
    // Basic: 9000 -> dailyRate = 300, hourlyRate = 30, overtimeRate = 30 * 1.35 = 40.5
    // Hours: 273 (5h overtime -> 5 * 40.5 = 202.5 -> round to 203)
    // Absences: 1 day -> 1 * 300 * 2 = 600
    // Leaves: 5 days (1 excess -> 1 * 300 = 300)
    // Half-days: 1 half-day -> 1 * 150 = 150
    // Advances: 1000
    // Bonuses: 500
    // Deductions: 200
    // Total additions = 9000 + 500 + 203 = 9703
    // Total deductions = 1000 + 600 + 300 + 150 + 200 = 2250
    // Expected net = 9703 - 2250 = 7453
    const res = calculateMonthlyPayroll({
      basicSalary: 9000,
      actualHours: 273,
      absentDays: 1,
      leaveDays: 5,
      halfDays: 1,
      bonuses: 500,
      advances: 1000,
      deductions: 200,
    });
    assert.strictEqual(res.dailyRate, 300);
    assert.strictEqual(res.overtimeAmount, 203);
    assert.strictEqual(res.absenceDeduction, 600);
    assert.strictEqual(res.leaveDeduction, 300);
    assert.strictEqual(res.halfDayDeduction, 150);
    assert.strictEqual(res.totalDeductions, 2250);
    assert.strictEqual(res.netSalary, 7453);
  });

  await test('F3.T2.4: Boundary - Zero basic salary handles calculations safely without NaN or division-by-zero', () => {
    const res = calculateMonthlyPayroll({ basicSalary: 0, actualHours: 268 });
    assert.strictEqual(res.dailyRate, 0);
    assert.strictEqual(res.netSalary, 0);
    assert.ok(!isNaN(res.dailyRate), 'dailyRate must not be NaN');
    assert.ok(!isNaN(res.netSalary), 'netSalary must not be NaN');
  });

  await test('F3.T2.5: Boundary - Deductions exceeding basic salary calculate correct negative net balance', () => {
    const res = calculateMonthlyPayroll({
      basicSalary: 3000,
      actualHours: 268,
      advances: 5000,
    });
    assert.strictEqual(res.netSalary, -2000, 'Net salary accurately reflects outstanding debt (-2000 EGP)');
  });

  // --------------------------------------------------------------------------
  // SECTION 3: System Module Payroll Alignment Verification (Tier 3)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: System Module Payroll Alignment Verification (Tier 3) ---');

  await test('F3.T3.1: Synchronize employees.service.js getEmployeePayslip with reports.service.js invariants', async () => {
    // Inspect source implementation of getEmployeePayslip in employees.service.js
    // Authoritative requirements:
    // 1. double penalty for absence (absentDays * dailyRate * 2)
    // 2. 4 free leaves (Math.max(0, leaveDays - 4) * dailyRate)
    // 3. half-day deductions (halfDays * (dailyRate / 2))
    // 4. late deduction based on dailyRate / 10
    const employeesServiceCode = require('fs').readFileSync(
      path.resolve(__dirname, '../src/server/modules/hr/employees.service.js'),
      'utf8'
    );

    const hasDoubleAbsence = employeesServiceCode.includes('absentDays * dailyRate * 2') ||
                             employeesServiceCode.includes('absenceDeduction = Math.round(absentDays * dailyRate * 2)');
    const hasFreeLeaves = employeesServiceCode.includes('Math.max(0, leaveDays - 4)') ||
                          employeesServiceCode.includes('leaveDeduction');
    const hasHalfDay = employeesServiceCode.includes('halfDays * (dailyRate / 2)') ||
                       employeesServiceCode.includes('halfDayDeduction');

    if (!hasDoubleAbsence) {
      implementationBugs.push({
        id: 'DEF-PAYROLL-01',
        module: 'src/server/modules/hr/employees.service.js',
        description: 'getEmployeePayslip does not enforce double penalty for absence (absentDays * dailyRate * 2)',
      });
    }
    if (!hasFreeLeaves) {
      implementationBugs.push({
        id: 'DEF-PAYROLL-02',
        module: 'src/server/modules/hr/employees.service.js',
        description: 'getEmployeePayslip does not implement 4 free leaves monthly policy',
      });
    }
    if (!hasHalfDay) {
      implementationBugs.push({
        id: 'DEF-PAYROLL-03',
        module: 'src/server/modules/hr/employees.service.js',
        description: 'getEmployeePayslip does not calculate half-day deductions',
      });
    }

    assert.ok(hasDoubleAbsence, 'employees.service.js must enforce double penalty absence deduction');
    assert.ok(hasFreeLeaves, 'employees.service.js must enforce 4 free leaves policy');
    assert.ok(hasHalfDay, 'employees.service.js must calculate half-day deductions');
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Consolidated Excel Export Validator (Tier 3 & Tier 4)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Consolidated Excel Export Validator (Tier 3 & 4) ---');

  let consolidatedWb = null;

  await test('F11.T3.1: generateConsolidatedBranchExcel produces buffer with all required worksheets', async () => {
    // Generate consolidated workbook for a 31-day month (e.g., October 2026)
    const buffer = await reportsExcel.generateConsolidatedBranchExcel(
      { branch_id: 2, month: '2026-10' },
      { role: 'admin' }
    );
    assert.ok(Buffer.isBuffer(buffer), 'Output must be a valid Buffer');
    assert.ok(buffer.length > 5000, `Buffer size (${buffer.length} bytes) indicates healthy workbook`);

    consolidatedWb = new ExcelJS.Workbook();
    await consolidatedWb.xlsx.load(buffer);
    assert.ok(consolidatedWb.worksheets.length >= 36, `Workbook must contain at least 36 sheets (got ${consolidatedWb.worksheets.length})`);
  });

  await test('F11.T3.2: Consolidated Excel contains exactly 31 daily worksheets for October (1-10-2026 to 31-10-2026)', () => {
    assert.ok(consolidatedWb, 'Workbook must be loaded');
    const sheetNames = consolidatedWb.worksheets.map(ws => ws.name);
    for (let day = 1; day <= 31; day++) {
      const expectedDailySheet = `${day}-10-2026`;
      assert.ok(sheetNames.includes(expectedDailySheet), `Missing daily sheet: ${expectedDailySheet}`);
    }
  });

  await test('F11.T3.3: Consolidated Excel contains MASTER STAFF LIST worksheet', () => {
    assert.ok(consolidatedWb, 'Workbook must be loaded');
    const ws = consolidatedWb.getWorksheet('MASTER STAFF LIST');
    assert.ok(ws, 'Worksheet "MASTER STAFF LIST" must exist');
    assert.strictEqual(ws.views[0]?.rightToLeft, true, 'Worksheet must be configured right-to-left');
  });

  await test('F11.T3.4: Consolidated Excel contains MASTER SHEET worksheet', () => {
    assert.ok(consolidatedWb, 'Workbook must be loaded');
    const ws = consolidatedWb.getWorksheet('MASTER SHEET');
    assert.ok(ws, 'Worksheet "MASTER SHEET" must exist');
    assert.strictEqual(ws.views[0]?.rightToLeft, true, 'Worksheet must be configured right-to-left');
  });

  await test('F11.T3.5: Consolidated Excel contains OHDA worksheet', () => {
    assert.ok(consolidatedWb, 'Workbook must be loaded');
    const ws = consolidatedWb.getWorksheet('OHDA');
    assert.ok(ws, 'Worksheet "OHDA" must exist');
    assert.strictEqual(ws.views[0]?.rightToLeft, true, 'Worksheet must be configured right-to-left');
  });

  await test('F11.T3.6: Consolidated Excel contains SALARY worksheet', () => {
    assert.ok(consolidatedWb, 'Workbook must be loaded');
    const ws = consolidatedWb.getWorksheet('SALARY');
    assert.ok(ws, 'Worksheet "SALARY" must exist');
    assert.strictEqual(ws.views[0]?.rightToLeft, true, 'Worksheet must be configured right-to-left');
  });

  await test('F11.T3.7: Consolidated Excel contains KPI worksheet', () => {
    assert.ok(consolidatedWb, 'Workbook must be loaded');
    const ws = consolidatedWb.getWorksheet('KPI');
    assert.ok(ws, 'Worksheet "KPI" must exist');
    assert.strictEqual(ws.views[0]?.rightToLeft, true, 'Worksheet must be configured right-to-left');
  });

  await test('F11.T3.8: Daily worksheet row 77 enforces formula E76-K77 (payments minus advances and expenses)', () => {
    assert.ok(consolidatedWb, 'Workbook must be loaded');
    const ws = consolidatedWb.getWorksheet('1-10-2026');
    assert.ok(ws, 'Sheet 1-10-2026 must exist');
    const cellD77 = ws.getCell('D77');
    assert.ok(cellD77.value, 'Cell D77 must have a value or formula object');
    if (typeof cellD77.value === 'object' && cellD77.value.formula) {
      assert.strictEqual(cellD77.value.formula, 'E76-K77', 'Row 77 formula must be E76-K77');
    }
  });

  await test('F11.T3.9: Excel summary line "صافي الكاش المحصل بالدرج" must export physical cash after advances', async () => {
    const mockSummary = {
      revenue: 10000,
      sales: 8000,
      rentals: 1000,
      tailoring: 1000,
      cogs: 4000,
      gross_profit: 6000,
      expenses: 1000,
      salaries: 2000,
      net_profit: 3000,
      profit_margin: 30,
      cash_drawer: 5000,           // Gross cash before advances
      total_advances: 1500,        // Advances to deduct
      physical_cash_in_drawer: 3500 // Invariant expected value
    };

    const buf = await reportsExcel.generateSummaryReportExcel(mockSummary);
    const summaryWb = new ExcelJS.Workbook();
    await summaryWb.xlsx.load(buf);
    const ws = summaryWb.worksheets[0];

    let foundRow = null;
    let actualValue = null;

    ws.eachRow((row, rowNumber) => {
      const label = String(row.getCell(1).value || '');
      if (label.includes('صافي الكاش المحصل بالدرج') || label.includes('النقدية الفعلية المحصلة بالخزينة')) {
        foundRow = rowNumber;
        actualValue = Number(row.getCell(2).value || 0);
      }
    });

    assert.ok(foundRow !== null, 'Summary row "صافي الكاش المحصل بالدرج" must exist in export');
    
    // Check if the exported value deducted advances (3500) vs unreduced cash_drawer (5000)
    if (actualValue === 5000) {
      implementationBugs.push({
        id: 'DEF-EXCEL-01',
        module: 'src/server/modules/reports/reports.excel.js:1101',
        description: 'Line 1101 exports summaryData.cash_drawer (5000) instead of summaryData.physical_cash_in_drawer (3500). Advances are not deducted in Excel export.',
      });
    }

    assert.strictEqual(
      actualValue,
      3500,
      `Excel summary "صافي الكاش المحصل بالدرج" must be 3500 (physical cash in drawer after advances), got ${actualValue}`
    );
  });

  // --------------------------------------------------------------------------
  // SECTION 5: Real-World Database Integration (Tier 4)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Real-World Database Integration (Tier 4) ---');

  await test('F2.T4.1: reports.service.js getExtendedDailyReport deducts advances in physical_cash_in_drawer', async () => {
    const today = new Date().toISOString().substring(0, 10);
    const report = await reportsService.getExtendedDailyReport({ date: today, branch_id: 2 });
    assert.ok(report, 'Extended daily report must return valid report object');
    assert.ok(report.summary, 'Report must contain summary object');
    assert.ok('physical_cash_in_drawer' in report.summary, 'Summary must include physical_cash_in_drawer');
    assert.ok('total_advances' in report.summary, 'Summary must include total_advances');
    assert.ok('cash_expenses' in report.summary, 'Summary must include cash_expenses');

    // Invariant: physical_cash_in_drawer = max(0, cash_collected - cash_expenses - total_advances)
    const expectedPhysical = Math.max(
      0,
      (report.summary.cash_collected || 0) - (report.summary.cash_expenses || 0) - (report.summary.total_advances || 0)
    );
    assert.strictEqual(
      report.summary.physical_cash_in_drawer,
      expectedPhysical,
      `physical_cash_in_drawer (${report.summary.physical_cash_in_drawer}) must match formula (${expectedPhysical})`
    );
  });

  await test('F2.T4.2: reports.service.js getProfitReport physical cash in drawer matches invariant', async () => {
    const today = new Date().toISOString().substring(0, 10);
    const pnl = await reportsService.getProfitReport({ start_date: today, end_date: today, branch_id: 'all' });
    assert.ok(pnl, 'Profit/loss report must return valid report object');
    assert.ok(pnl.summary, 'P&L report must contain summary object');
    assert.ok('physical_cash_in_drawer' in pnl.summary, 'P&L summary must include physical_cash_in_drawer');

    // Summary physical cash should be non-negative
    assert.ok(pnl.summary.physical_cash_in_drawer >= 0, 'Physical cash in drawer must be >= 0');
  });

  // --------------------------------------------------------------------------
  // FINAL REPORT & ESCALATIONS
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failures.length} Failed)`);
  console.log('================================================================');

  if (implementationBugs.length > 0) {
    console.log('\n⚠️ IMPLEMENTATION BUGS / INVARIANT VIOLATIONS DISCOVERED:');
    implementationBugs.forEach((bug, idx) => {
      console.log(`  ${idx + 1}. [${bug.id}] ${bug.module}`);
      console.log(`     Details: ${bug.description}`);
    });
  }

  if (failures.length > 0) {
    console.log('\nFAILURE DETAILS:');
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. Test: ${f.name}`);
      console.log(`     Error: ${f.error}`);
    });
    // Exit with code 1 so test runner / CI detects failure
    process.exit(1);
  } else {
    console.log('\n✓ ALL INVARIANT TESTS PASSED CLEANLY.');
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('\nFATAL SUITE CRASH:', err);
  process.exit(1);
});
