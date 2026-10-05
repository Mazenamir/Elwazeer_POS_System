const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const { getDatabaseCairoNow, getMonthRange } = require('../../../shared/utils/date');
const {
  getReportBranchId,
  canViewReportProfit,
  stripReportProfit,
  employeeTransactionReportAmountSql,
  employeeTransactionRemainingDeltaSql,
  normalizedPaymentMethodSql,
  rowsByBranch,
  getDayRange,
} = require('./reports.helpers');

async function getDashboard(query = {}, user = null) {
  if (!user || user.role !== 'admin') {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  let branchId = null;
  const params = [];
  if (user && user.role === 'branch_user') {
    branchId = user.branch_id;
  } else if (query.branch_id && query.branch_id !== 'all') {
    branchId = query.branch_id;
  }

  let branchFilter = '';
  if (branchId) {
    params.push(branchId);
    branchFilter = 'WHERE branch_id = $1';
  }
  const whereAnd = branchFilter ? branchFilter + ' AND' : 'WHERE';
  const dayEndSql = `(${CAIRO_DATE_SQL} + INTERVAL '1 day')`;

  const [
    totalSalesRes,
    dailyReturnsRes,
    totalRentalsRes,
    totalFinesRes,
    totalTailoringRes,
    cogsTodayRes,
    returnCogsTodayRes,
    totalExpensesRes,
    ordersTodayRes,
    newCustomersRes,
  ] = await Promise.all([
    db.query(`SELECT SUM(total_amount) as total FROM orders ${whereAnd} order_date >= ${CAIRO_DATE_SQL} AND order_date < ${dayEndSql}`, params),
    db.query(`SELECT SUM(total_return_amount) as total FROM returns ${whereAnd} return_date >= ${CAIRO_DATE_SQL} AND return_date < ${dayEndSql}`, params),
    db.query(`SELECT SUM(total_price) as total FROM rentals ${whereAnd} booking_date >= ${CAIRO_DATE_SQL} AND booking_date < ${dayEndSql}`, params),
    db.query(`SELECT SUM(fine_amount) as total FROM rentals ${whereAnd} actual_return_date >= ${CAIRO_DATE_SQL} AND actual_return_date < ${dayEndSql} AND status = 'returned'`, params),
    db.query(`SELECT SUM(amount) as total FROM tailoring_payments ${whereAnd} payment_date >= ${CAIRO_DATE_SQL} AND payment_date < ${dayEndSql}`, params),
    db.query(`SELECT COALESCE(SUM(oi.quantity * COALESCE(i.cost_price, 0)), 0) as total FROM order_items oi JOIN orders o ON oi.order_id = o.id LEFT JOIN inventory i ON oi.inventory_id = i.id ${branchId ? 'WHERE o.branch_id = $1 AND' : 'WHERE'} o.order_date >= ${CAIRO_DATE_SQL} AND o.order_date < ${dayEndSql}`, params),
    db.query(`SELECT COALESCE(SUM(ri.quantity * COALESCE(i.cost_price, 0)), 0) as total FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN inventory i ON ri.inventory_id = i.id ${branchId ? 'WHERE r.branch_id = $1 AND' : 'WHERE'} r.return_date >= ${CAIRO_DATE_SQL} AND r.return_date < ${dayEndSql}`, params),
    db.query(`SELECT SUM(amount) as total FROM expenses ${whereAnd} expense_date = ${CAIRO_DATE_SQL}`, params),
    db.query(`SELECT COUNT(*) as count FROM orders ${whereAnd} order_date >= ${CAIRO_DATE_SQL} AND order_date < ${dayEndSql}`, params),
    db.query(`SELECT COUNT(*) as count FROM customers ${whereAnd} join_date = ${CAIRO_DATE_SQL}`, params),
  ]);

  const dailyReturns = Number(dailyReturnsRes.rows[0]?.total) || 0;
  const netSales = (Number(totalSalesRes.rows[0]?.total) || 0) - dailyReturns;
  const dailyRentals = (Number(totalRentalsRes.rows[0]?.total) || 0) + (Number(totalFinesRes.rows[0]?.total) || 0);
  const dailyTailoring = Number(totalTailoringRes.rows[0]?.total) || 0;
  const totalRevenueToday = netSales + dailyRentals + dailyTailoring;

  const cogsToday = Number(cogsTodayRes.rows[0]?.total || 0) - Number(returnCogsTodayRes.rows[0]?.total || 0);
  const totalExpenses = Number(totalExpensesRes.rows[0]?.total) || 0;
  const netProfitToday = totalRevenueToday - totalExpenses - cogsToday;

  let lowStockQuery = `
    SELECT COUNT(*) as count 
    FROM inventory_branches ib
    JOIN inventory i ON ib.inventory_id = i.id
    WHERE ib.stock_level <= COALESCE(i.min_stock_level, 5)
  `;
  if (branchFilter) lowStockQuery += ' AND ib.branch_id = $1';
  const lowStockRes = await db.query(lowStockQuery, params);

  const recentOrdersRes = await db.query(`
    SELECT o.id, c.name as customer_name, o.order_date, o.status, o.total_amount
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    ${branchId ? 'WHERE o.branch_id = $1' : ''}
    ORDER BY o.order_date DESC
    LIMIT 5
  `, params);

  const topProductsParams = [...params, config.TOP_PRODUCTS_LOOKBACK_DAYS];
  const topProductsDateParam = topProductsParams.length;
  const topProductsWhere = branchId
    ? `WHERE o.branch_id = $1 AND o.order_date >= ${CAIRO_DATE_SQL} - ($${topProductsDateParam}::int * INTERVAL '1 day')`
    : `WHERE o.order_date >= ${CAIRO_DATE_SQL} - ($${topProductsDateParam}::int * INTERVAL '1 day')`;

  const topProductsRes = await db.query(`
    SELECT i.name, i.category, i.image_url as image, i.price, SUM(oi.quantity) as sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN inventory i ON oi.inventory_id = i.id
    ${topProductsWhere}
    GROUP BY i.id, i.name, i.category, i.image_url, i.price
    ORDER BY sales DESC
    LIMIT 20
  `, topProductsParams);

  const range = query.range || '7days';
  let revenueTrendQuery = '';

  if (range === 'today') {
    revenueTrendQuery = `
      SELECT 
        TO_CHAR(h, 'HH24:00') as day, 
        COALESCE(SUM(o.total_amount), 0) - COALESCE((
          SELECT SUM(total_return_amount) 
          FROM returns r 
          WHERE r.return_date >= h AND r.return_date < h + INTERVAL '1 hour' ${branchFilter ? 'AND r.branch_id = $1' : ''}
        ), 0) as total, 
        h as date_val
      FROM generate_series((${CAIRO_DATE_SQL})::timestamp, (${CAIRO_DATE_SQL})::timestamp + INTERVAL '23 hours', '1 hour') h
      LEFT JOIN orders o ON o.order_date >= h AND o.order_date < h + INTERVAL '1 hour' ${branchFilter ? 'AND o.branch_id = $1' : ''}
      GROUP BY h
      ORDER BY h ASC
    `;
  } else if (range === '30days') {
    revenueTrendQuery = `
      SELECT 
        TO_CHAR(d, 'DD/MM') as day, 
        COALESCE(SUM(o.total_amount), 0) - COALESCE((
          SELECT SUM(total_return_amount) 
          FROM returns r 
          WHERE r.return_date >= d AND r.return_date < d + INTERVAL '1 day' ${branchFilter ? 'AND r.branch_id = $1' : ''}
        ), 0) as total, 
        d as date_val
      FROM generate_series(${CAIRO_DATE_SQL} - INTERVAL '29 days', ${CAIRO_DATE_SQL}, '1 day') d
      LEFT JOIN orders o ON o.order_date >= d AND o.order_date < d + INTERVAL '1 day' ${branchFilter ? 'AND o.branch_id = $1' : ''}
      GROUP BY d
      ORDER BY d ASC
    `;
  } else {
    revenueTrendQuery = `
      SELECT 
        TO_CHAR(d, 'Day') as day, 
        COALESCE(SUM(o.total_amount), 0) - COALESCE((
          SELECT SUM(total_return_amount) 
          FROM returns r 
          WHERE r.return_date >= d AND r.return_date < d + INTERVAL '1 day' ${branchFilter ? 'AND r.branch_id = $1' : ''}
        ), 0) as total, 
        d as date_val
      FROM generate_series(${CAIRO_DATE_SQL} - INTERVAL '6 days', ${CAIRO_DATE_SQL}, '1 day') d
      LEFT JOIN orders o ON o.order_date >= d AND o.order_date < d + INTERVAL '1 day' ${branchFilter ? 'AND o.branch_id = $1' : ''}
      GROUP BY d
      ORDER BY d ASC
    `;
  }

  const revenueTrendRes = await db.query(revenueTrendQuery, params);

  return {
    totalSales: totalRevenueToday,
    totalExpenses: totalExpensesRes.rows[0]?.total || 0,
    ordersToday: ordersTodayRes.rows[0]?.count || 0,
    newCustomers: newCustomersRes.rows[0]?.count || 0,
    lowStock: lowStockRes.rows[0]?.count || 0,
    dailyReturns: dailyReturnsRes.rows[0]?.total || 0,
    netProfit: netProfitToday,
    recentOrders: recentOrdersRes.rows,
    topProducts: topProductsRes.rows,
    revenueTrend: revenueTrendRes.rows,
  };
}

async function getTopProductsByBranch(query = {}, user = null) {
  if (!user || user.role !== 'admin') {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  const branchId = query.branch_id;
  const params = [config.TOP_PRODUCTS_LOOKBACK_DAYS];
  const where = [`o.order_date >= ${CAIRO_DATE_SQL} - ($1::int * INTERVAL '1 day')`];

  if (branchId && branchId !== 'all') {
    params.push(branchId);
    where.push(`o.branch_id = $${params.length}`);
  }

  const topProductsRes = await db.query(`
    SELECT i.name, i.category, i.image_url as image, i.price, SUM(oi.quantity) as sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN inventory i ON oi.inventory_id = i.id
    WHERE ${where.join(' AND ')}
    GROUP BY i.id, i.name, i.category, i.image_url, i.price
    ORDER BY sales DESC
    LIMIT 20
  `, params);

  return topProductsRes.rows;
}

async function getProfitReport(query = {}, user = null) {
  let month = query.month;
  if (!month) month = (await getDatabaseCairoNow(db)).month;

  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  let branchQuery = 'SELECT id, name FROM branches WHERE is_main_warehouse = false';
  const params = [];
  if (reportBranchId) {
    branchQuery += ' AND id = $1';
    params.push(reportBranchId);
  }

  const branchesRes = await db.query(branchQuery, params);
  const branches = branchesRes.rows;
  const branchIds = branches.map(branch => Number(branch.id)).filter(Number.isFinite);

  if (branchIds.length === 0) {
    const emptySummary = { total_sales: 0, total_rentals: 0, total_tailoring: 0, total_revenue: 0, cash_drawer: 0, cogs: 0, expenses: 0, total_salaries_paid: 0, net_profit: 0 };
    return {
      month,
      branch_reports: [],
      summary: canViewReportProfit(user) ? emptySummary : stripReportProfit(emptySummary),
      payments: [],
      expenses: { total: 0, items: [] },
      salaries: { total: 0, items: [] },
    };
  }

  const range = getMonthRange(month);
  const reportParams = [branchIds, range.start, range.end];

  const [
    salesRes,
    finesRes,
    returnsRes,
    cogsRes,
    returnCogsRes,
    expensesRes,
    salariesRes,
    rentalsRes,
    tailoringRes,
    cashRes,
    inventoryValueRes,
  ] = await Promise.all([
    db.query(
      `SELECT branch_id, COALESCE(SUM(total_amount), 0) as total
       FROM orders
       WHERE branch_id = ANY($1::int[]) AND order_date >= $2::date AND order_date < $3::date
       GROUP BY branch_id`,
      reportParams
    ),
    db.query(
      `SELECT branch_id, COALESCE(SUM(fine_amount), 0) as total
       FROM rentals
       WHERE branch_id = ANY($1::int[]) AND actual_return_date >= $2::date AND actual_return_date < $3::date AND status = 'returned'
       GROUP BY branch_id`,
      reportParams
    ),
    db.query(
      `SELECT branch_id, COALESCE(SUM(total_return_amount), 0) as total
       FROM returns
       WHERE branch_id = ANY($1::int[]) AND return_date >= $2::date AND return_date < $3::date
       GROUP BY branch_id`,
      reportParams
    ),
    db.query(
      `SELECT o.branch_id, COALESCE(SUM(oi.quantity * COALESCE(i.cost_price, 0)), 0) as total
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       LEFT JOIN inventory i ON i.id = oi.inventory_id
       WHERE o.branch_id = ANY($1::int[]) AND o.order_date >= $2::date AND o.order_date < $3::date
       GROUP BY o.branch_id`,
      reportParams
    ),
    db.query(
      `SELECT r.branch_id, COALESCE(SUM(ri.quantity * COALESCE(i.cost_price, 0)), 0) as total
       FROM return_items ri
       JOIN returns r ON ri.return_id = r.id
       LEFT JOIN inventory i ON i.id = ri.inventory_id
       WHERE r.branch_id = ANY($1::int[]) AND r.return_date >= $2::date AND r.return_date < $3::date
       GROUP BY r.branch_id`,
      reportParams
    ),
    db.query(
      `SELECT branch_id, COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE branch_id = ANY($1::int[]) AND category <> 'bonus' AND expense_date >= $2::date AND expense_date < $3::date
       GROUP BY branch_id`,
      reportParams
    ),
    db.query(
      `SELECT e.branch_id, COALESCE(SUM(${employeeTransactionReportAmountSql('et')}), 0) as total
       FROM employee_transactions et
       JOIN employees e ON e.id = et.employee_id
       WHERE e.branch_id = ANY($1::int[])
         AND et.type IN ('salary_payment', 'advance', 'deduction', 'bonus')
         AND et.transaction_date >= $2::date
         AND et.transaction_date < $3::date
       GROUP BY e.branch_id`,
      reportParams
    ),
    db.query(
      `SELECT branch_id, COALESCE(SUM(total_price), 0) as total
       FROM rentals
       WHERE branch_id = ANY($1::int[]) AND booking_date >= $2::date AND booking_date < $3::date
       GROUP BY branch_id`,
      reportParams
    ),
    db.query(
      `SELECT branch_id, COALESCE(SUM(amount), 0) as total
       FROM tailoring_payments
       WHERE branch_id = ANY($1::int[]) AND payment_date >= $2::date AND payment_date < $3::date
       GROUP BY branch_id`,
      reportParams
    ),
    db.query(
      `SELECT branch_id, COALESCE(SUM(total), 0) as total
       FROM (
         SELECT branch_id, total_amount as total
         FROM orders
         WHERE branch_id = ANY($1::int[])
           AND order_date >= $2::date
           AND order_date < $3::date
           AND ${normalizedPaymentMethodSql('payment_method')} = 'cash'
         UNION ALL
         SELECT branch_id, total_price as total
         FROM rentals
         WHERE branch_id = ANY($1::int[])
           AND booking_date >= $2::date
           AND booking_date < $3::date
           AND ${normalizedPaymentMethodSql('payment_method')} = 'cash'
         UNION ALL
         SELECT branch_id, fine_amount as total
         FROM rentals
         WHERE branch_id = ANY($1::int[])
           AND actual_return_date >= $2::date
           AND actual_return_date < $3::date
           AND status = 'returned'
           AND ${normalizedPaymentMethodSql('payment_method')} = 'cash'
         UNION ALL
         SELECT p.branch_id, p.amount as total
         FROM tailoring_payments p
         JOIN tailoring_orders t ON p.tailoring_order_id = t.id
         WHERE p.branch_id = ANY($1::int[])
           AND p.payment_date >= $2::date
           AND p.payment_date < $3::date
           AND ${normalizedPaymentMethodSql('t.payment_method')} = 'cash'
       ) cash_payments
       GROUP BY branch_id`,
      reportParams
    ),
    db.query(
      `SELECT ib.branch_id, COALESCE(SUM(i.cost_price * ib.stock_level), 0) as total
       FROM inventory_branches ib
       JOIN inventory i ON i.id = ib.inventory_id
       WHERE ib.branch_id = ANY($1::int[])
       GROUP BY ib.branch_id`,
      [branchIds]
    ),
  ]);

  const salesByBranch = rowsByBranch(salesRes.rows, row => Number(row.total));
  const finesByBranch = rowsByBranch(finesRes.rows, row => Number(row.total));
  const returnsByBranch = rowsByBranch(returnsRes.rows, row => Number(row.total));
  const cogsByBranch = rowsByBranch(cogsRes.rows, row => Number(row.total));
  const returnCogsByBranch = rowsByBranch(returnCogsRes.rows, row => Number(row.total));
  const expensesByBranch = rowsByBranch(expensesRes.rows, row => Number(row.total));
  const salariesByBranch = rowsByBranch(salariesRes.rows, row => Number(row.total));
  const rentalsByBranch = rowsByBranch(rentalsRes.rows, row => Number(row.total));
  const tailoringByBranch = rowsByBranch(tailoringRes.rows, row => Number(row.total));
  const cashByBranch = rowsByBranch(cashRes.rows, row => Number(row.total));
  const inventoryValueByBranch = rowsByBranch(inventoryValueRes.rows, row => Number(row.total));

  const report = branches.map(branch => {
    const branchId = Number(branch.id);
    const total_returns = returnsByBranch.get(branchId) || 0;
    const total_sales = (salesByBranch.get(branchId) || 0) - total_returns;
    const cogs = (cogsByBranch.get(branchId) || 0) - (returnCogsByBranch.get(branchId) || 0);
    const expenses = expensesByBranch.get(branchId) || 0;
    const total_salaries_paid = salariesByBranch.get(branchId) || 0;
    const total_rentals = (rentalsByBranch.get(branchId) || 0) + (finesByBranch.get(branchId) || 0);
    const total_tailoring = tailoringByBranch.get(branchId) || 0;
    const total_revenue = total_sales + total_rentals + total_tailoring;
    const cash_drawer = (cashByBranch.get(branchId) || 0) - total_returns - expenses;
    const net_profit = total_revenue - (cogs + expenses + total_salaries_paid);

    return {
      branch_id: branch.id,
      branch_name: branch.name,
      total_sales,
      total_rentals,
      total_tailoring,
      total_revenue,
      cash_drawer,
      cogs,
      expenses,
      total_salaries_paid,
      net_profit,
      total_inventory_value: inventoryValueByBranch.get(branchId) || 0,
    };
  });

  const summary = report.reduce((acc, curr) => {
    acc.total_sales += curr.total_sales;
    acc.total_rentals += curr.total_rentals;
    acc.total_tailoring += curr.total_tailoring;
    acc.cogs += curr.cogs;
    acc.expenses += curr.expenses;
    acc.total_salaries_paid += curr.total_salaries_paid;
    acc.net_profit += curr.net_profit;
    acc.total_revenue += curr.total_revenue;
    acc.cash_drawer += curr.cash_drawer;
    acc.total_inventory_value += curr.total_inventory_value;
    return acc;
  }, { total_sales: 0, total_rentals: 0, total_tailoring: 0, total_revenue: 0, cash_drawer: 0, cogs: 0, expenses: 0, total_salaries_paid: 0, net_profit: 0, total_inventory_value: 0 });

  const paymentParams = reportBranchId ? [range.start, range.end, reportBranchId] : [range.start, range.end];
  const paymentBranchFilter = reportBranchId ? ' AND branch_id = $3' : '';

  const [paymentRes, expenseItemsRes, salaryItemsRes, tailoringItemsRes] = await Promise.all([
    db.query(
      `SELECT payment_method, SUM(total) as total
       FROM (
         SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, total_amount as total
         FROM orders
         WHERE order_date >= $1::date AND order_date < $2::date${paymentBranchFilter}
         UNION ALL
         SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, total_price as total
         FROM rentals
         WHERE booking_date >= $1::date AND booking_date < $2::date${paymentBranchFilter}
         UNION ALL
         SELECT ${normalizedPaymentMethodSql('t.payment_method')} as payment_method, p.amount as total
         FROM tailoring_payments p
         JOIN tailoring_orders t ON p.tailoring_order_id = t.id
         WHERE p.payment_date >= $1::date AND p.payment_date < $2::date${paymentBranchFilter.replace('branch_id', 'p.branch_id')}
       ) payments
       GROUP BY payment_method`,
      paymentParams
    ),
    db.query(
      `SELECT e.id,
              TO_CHAR(e.expense_date, 'YYYY-MM-DD') as expense_date,
              COALESCE(NULLIF(e.category, ''), 'غير محدد') as category,
              COALESCE(e.amount, 0) as amount,
              COALESCE(e.notes, '') as notes,
              e.branch_id,
              COALESCE(b.name, '-') as branch_name
       FROM expenses e
       LEFT JOIN branches b ON e.branch_id = b.id
       WHERE e.branch_id = ANY($1::int[]) AND e.category <> 'bonus' AND e.expense_date >= $2::date AND e.expense_date < $3::date
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT 200`,
      reportParams
    ),
    db.query(
      `WITH scoped_transactions AS (
         SELECT et.id,
                et.employee_id,
                et.type,
                et.amount,
                et.transaction_date,
                COALESCE(et.notes, '') as notes,
                e.basic_salary,
                e.name as employee_name,
                e.branch_id,
                COALESCE(b.name, '-') as branch_name,
                ${employeeTransactionReportAmountSql('et')} as report_amount,
                ${employeeTransactionRemainingDeltaSql('et')} as remaining_delta
         FROM employee_transactions et
         JOIN employees e ON e.id = et.employee_id
         LEFT JOIN branches b ON b.id = e.branch_id
         WHERE e.branch_id = ANY($1::int[])
           AND et.type IN ('salary_payment', 'advance', 'deduction', 'bonus')
           AND et.transaction_date >= DATE_TRUNC('month', $2::date)::date
           AND et.transaction_date < $3::date
       ),
       with_remaining AS (
         SELECT *,
                basic_salary - SUM(remaining_delta) OVER (
                  PARTITION BY employee_id, DATE_TRUNC('month', transaction_date)
                  ORDER BY transaction_date, id
                ) as remaining_salary
         FROM scoped_transactions
       )
       SELECT id,
              TO_CHAR(transaction_date, 'YYYY-MM-DD') as payment_date,
              type as transaction_type,
              amount,
              report_amount,
              remaining_salary,
              notes,
              employee_id,
              employee_name,
              branch_id,
              branch_name
       FROM with_remaining
       WHERE transaction_date >= $2::date AND transaction_date < $3::date
       ORDER BY transaction_date DESC, id DESC
       LIMIT 300`,
      reportParams
    ),
    db.query(
      `SELECT p.id,
              t.invoice_number,
              t.customer_name,
              t.product_description,
              p.amount,
              t.total_amount,
              t.remaining_amount,
              p.branch_id,
              COALESCE(b.name, '-') as branch_name,
              TO_CHAR(p.payment_date, 'YYYY-MM-DD HH12:MI AM') as created_date,
              p.is_remainder
       FROM tailoring_payments p
       JOIN tailoring_orders t ON p.tailoring_order_id = t.id
       LEFT JOIN branches b ON p.branch_id = b.id
       WHERE p.branch_id = ANY($1::int[]) AND p.payment_date >= $2::date AND p.payment_date < $3::date
       ORDER BY p.payment_date DESC
       LIMIT 300`,
      reportParams
    ),
  ]);

  const expenseDetails = {
    total: Number(summary.expenses || 0),
    items: expenseItemsRes.rows.map(row => ({
      ...row,
      amount: Number(row.amount || 0),
    })),
  };

  const salaryDetails = {
    total: Number(summary.total_salaries_paid || 0),
    items: salaryItemsRes.rows.map(row => ({
      ...row,
      amount: Number(row.amount || 0),
      report_amount: Number(row.report_amount || 0),
      remaining_salary: Number(row.remaining_salary || 0),
    })),
  };

  const tailoringDetails = {
    total: Number(summary.total_tailoring || 0),
    items: tailoringItemsRes.rows.map(row => ({
      ...row,
      amount: Number(row.amount || 0),
    })),
  };

  const [attendanceRes, salesInvoicesRes, rentalInvoicesRes] = await Promise.all([
    db.query(
      `SELECT a.employee_id, e.name as employee_name, b.name as branch_name, TO_CHAR(a.date, 'YYYY-MM-DD') as date, TO_CHAR(a.check_in, 'HH12:MI AM') as check_in, TO_CHAR(a.check_out, 'HH12:MI AM') as check_out, a.total_hours, a.notes
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN branches b ON e.branch_id = b.id
       WHERE e.branch_id = ANY($1::int[]) AND a.date >= $2::date AND a.date < $3::date
       ORDER BY a.date DESC`,
      reportParams
    ),
    db.query(
      `SELECT COALESCE(o.branch_invoice_number, o.id) as invoice_number, o.total_amount as amount, o.paid_amount, GREATEST(o.total_amount - o.paid_amount - COALESCE(o.invoice_discount,0), 0) as remainder, e.name as cashier_name, o.payment_method, TO_CHAR(o.order_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'sales' as invoice_type
       FROM orders o
       LEFT JOIN employees e ON o.seller_id = e.id
       WHERE o.branch_id = ANY($1::int[]) AND o.order_date >= $2::date AND o.order_date < $3::date
       ORDER BY o.order_date DESC LIMIT 1500`,
      reportParams
    ),
    db.query(
      `SELECT r.id as invoice_number, r.total_price as amount, r.deposit as paid_amount, r.remaining as remainder, e.name as cashier_name, r.payment_method, TO_CHAR(r.booking_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'rental' as invoice_type
       FROM rentals r
       LEFT JOIN employees e ON r.seller_id = e.id
       WHERE r.branch_id = ANY($1::int[]) AND r.booking_date >= $2::date AND r.booking_date < $3::date
       ORDER BY r.booking_date DESC LIMIT 1500`,
      reportParams
    ),
  ]);

  const canViewProfit = canViewReportProfit(user);

  return {
    month,
    branch_reports: canViewProfit ? report : report.map(stripReportProfit),
    summary: canViewProfit ? summary : stripReportProfit(summary),
    payments: paymentRes.rows,
    expenses: expenseDetails,
    salaries: salaryDetails,
    tailoring: tailoringDetails,
    attendance: attendanceRes.rows,
    sales_invoices: salesInvoicesRes.rows,
    rental_invoices: rentalInvoicesRes.rows,
  };
}

async function getMonthlyHistory(query = {}, user = null) {
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const fromMonth = query.from_month && /^\d{4}-\d{2}$/.test(query.from_month)
    ? query.from_month + '-01'
    : null;
  const toMonth = query.to_month && /^\d{4}-\d{2}$/.test(query.to_month)
    ? query.to_month + '-01'
    : null;

  const startMonthExpr = fromMonth
    ? `'${fromMonth}'::date`
    : `DATE_TRUNC('month', ${CAIRO_DATE_SQL}) - INTERVAL '11 months'`;
  const endMonthExpr = toMonth
    ? `DATE_TRUNC('month', '${toMonth}'::date) + INTERVAL '1 month'`
    : `DATE_TRUNC('month', ${CAIRO_DATE_SQL}) + INTERVAL '1 month'`;
  const currentMonthExpr = toMonth
    ? `DATE_TRUNC('month', '${toMonth}'::date)`
    : `DATE_TRUNC('month', ${CAIRO_DATE_SQL})`;

  let branchFilter = '';
  let orderBranchFilter = '';
  let rentalBranchFilter = '';
  let returnBranchFilter = '';
  let employeeBranchFilter = '';
  const params = [];

  if (reportBranchId) {
    branchFilter = 'AND branch_id = $1';
    orderBranchFilter = 'AND o.branch_id = $1';
    rentalBranchFilter = 'AND r.branch_id = $1';
    returnBranchFilter = 'AND r.branch_id = $1';
    employeeBranchFilter = 'AND e.branch_id = $1';
    params.push(reportBranchId);
  }

  const sqlQuery = `
    WITH bounds AS (
      SELECT ${startMonthExpr} as start_month,
             ${endMonthExpr} as end_month
    ),
    months AS (
      SELECT generate_series(
        (SELECT start_month FROM bounds),
        ${currentMonthExpr},
        '1 month'
      )::date as month_start
    ),
    orders_m AS (
      SELECT DATE_TRUNC('month', order_date)::date as month_start, SUM(total_amount) as total
      FROM orders, bounds
      WHERE order_date >= bounds.start_month AND order_date < bounds.end_month ${branchFilter}
      GROUP BY 1
    ),
    returns_m AS (
      SELECT DATE_TRUNC('month', return_date)::date as month_start, SUM(total_return_amount) as total
      FROM returns, bounds
      WHERE return_date >= bounds.start_month AND return_date < bounds.end_month ${branchFilter}
      GROUP BY 1
    ),
    fines_m AS (
      SELECT DATE_TRUNC('month', actual_return_date)::date as month_start, SUM(fine_amount) as total
      FROM rentals, bounds
      WHERE actual_return_date >= bounds.start_month AND actual_return_date < bounds.end_month AND status = 'returned' ${branchFilter}
      GROUP BY 1
    ),
    rentals_m AS (
      SELECT DATE_TRUNC('month', booking_date)::date as month_start, SUM(total_price) as total
      FROM rentals, bounds
      WHERE booking_date >= bounds.start_month AND booking_date < bounds.end_month ${branchFilter}
      GROUP BY 1
    ),
    tailoring_m AS (
      SELECT DATE_TRUNC('month', payment_date)::date as month_start, SUM(amount) as total
      FROM tailoring_payments, bounds
      WHERE payment_date >= bounds.start_month AND payment_date < bounds.end_month ${branchFilter}
      GROUP BY 1
    ),
    expenses_m AS (
      SELECT DATE_TRUNC('month', expense_date)::date as month_start, SUM(amount) as total
      FROM expenses, bounds
      WHERE category <> 'bonus' AND expense_date >= bounds.start_month AND expense_date < bounds.end_month ${branchFilter}
      GROUP BY 1
    ),
    salaries_m AS (
      SELECT DATE_TRUNC('month', et.transaction_date)::date as month_start,
             COALESCE(SUM(${employeeTransactionReportAmountSql('et')}), 0) as total
      FROM employee_transactions et
      JOIN employees e ON e.id = et.employee_id
      JOIN branches eb ON eb.id = e.branch_id AND eb.is_main_warehouse = false
      CROSS JOIN bounds
      WHERE et.type IN ('salary_payment', 'advance', 'deduction', 'bonus')
        AND et.transaction_date >= bounds.start_month
        AND et.transaction_date < bounds.end_month
        ${employeeBranchFilter}
      GROUP BY 1
    ),
    cogs_m AS (
      SELECT DATE_TRUNC('month', o.order_date)::date as month_start,
             SUM(oi.quantity * COALESCE(i.cost_price, 0)) as total
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN inventory i ON i.id = oi.inventory_id
      CROSS JOIN bounds
      WHERE o.order_date >= bounds.start_month AND o.order_date < bounds.end_month ${orderBranchFilter}
      GROUP BY 1
    ),
    return_cogs_m AS (
      SELECT DATE_TRUNC('month', r.return_date)::date as month_start,
             SUM(ri.quantity * COALESCE(i.cost_price, 0)) as total
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      LEFT JOIN inventory i ON i.id = ri.inventory_id
      CROSS JOIN bounds
      WHERE r.return_date >= bounds.start_month AND r.return_date < bounds.end_month ${returnBranchFilter}
      GROUP BY 1
    )
    SELECT TO_CHAR(m.month_start, 'YYYY-MM') as month_str,
           COALESCE(orders_m.total, 0) - COALESCE(returns_m.total, 0) as revenue,
           COALESCE(fines_m.total, 0) as fines,
           COALESCE(rentals_m.total, 0) as rentals,
           COALESCE(tailoring_m.total, 0) as tailoring,
           COALESCE(expenses_m.total, 0) as expenses,
           COALESCE(salaries_m.total, 0) as salaries,
           COALESCE(cogs_m.total, 0) - COALESCE(return_cogs_m.total, 0) as cogs
    FROM months m
    LEFT JOIN orders_m ON orders_m.month_start = m.month_start
    LEFT JOIN returns_m ON returns_m.month_start = m.month_start
    LEFT JOIN fines_m ON fines_m.month_start = m.month_start
    LEFT JOIN rentals_m ON rentals_m.month_start = m.month_start
    LEFT JOIN tailoring_m ON tailoring_m.month_start = m.month_start
    LEFT JOIN expenses_m ON expenses_m.month_start = m.month_start
    LEFT JOIN salaries_m ON salaries_m.month_start = m.month_start
    LEFT JOIN cogs_m ON cogs_m.month_start = m.month_start
    LEFT JOIN return_cogs_m ON return_cogs_m.month_start = m.month_start
    ORDER BY m.month_start DESC
  `;

  const [{ rows }, cairoNow] = await Promise.all([
    db.query(sqlQuery, params),
    getDatabaseCairoNow(db),
  ]);

  let history = rows.map(r => ({
    month: r.month_str,
    revenue: Number(r.revenue) + Number(r.rentals) + Number(r.fines) + Number(r.tailoring),
    sales_revenue: Number(r.revenue),
    rental_revenue: Number(r.rentals) + Number(r.fines),
    tailoring_revenue: Number(r.tailoring),
    expenses: Number(r.expenses),
    salaries: Number(r.salaries),
    cogs: Number(r.cogs),
    profit: (Number(r.revenue) + Number(r.rentals) + Number(r.fines) + Number(r.tailoring)) - (Number(r.expenses) + Number(r.salaries) + Number(r.cogs)),
  })).filter(m => m.revenue !== 0 || m.expenses !== 0 || m.salaries !== 0 || m.cogs !== 0 || m.month === cairoNow.month);

  if (!canViewReportProfit(user)) {
    history = history.map(stripReportProfit);
  }

  return history;
}

async function getDailyHistory(query = {}, user = null) {
  const fromDate = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : null;
  const toDate = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : null;

  const requestedDays = Number.parseInt(query.days, 10);
  const days = Number.isInteger(requestedDays) ? Math.max(1, Math.min(requestedDays, 365)) : 30;

  const startDayExpr = fromDate
    ? `'${fromDate}'::date`
    : `(${CAIRO_DATE_SQL} - (INTERVAL '1 day' * ${days - 1}))::date`;
  const endDayExpr = toDate
    ? `('${toDate}'::date + INTERVAL '1 day')::date`
    : `(${CAIRO_DATE_SQL} + INTERVAL '1 day')::date`;
  const currentDayExpr = toDate
    ? `'${toDate}'::date`
    : CAIRO_DATE_SQL;

  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  let branchFilter = '';
  let orderBranchFilter = '';
  let returnBranchFilter = '';
  let employeeBranchFilter = '';
  const params = [];

  if (reportBranchId) {
    branchFilter = 'AND branch_id = $1';
    orderBranchFilter = 'AND o.branch_id = $1';
    returnBranchFilter = 'AND r.branch_id = $1';
    employeeBranchFilter = 'AND e.branch_id = $1';
    params.push(reportBranchId);
  }

  const sqlQuery = `
    WITH bounds AS (
      SELECT ${startDayExpr} as start_day,
             ${endDayExpr} as end_day
    ),
    days AS (
      SELECT generate_series(
        (SELECT start_day FROM bounds),
        ${currentDayExpr},
        '1 day'
      )::date as report_date
    ),
    orders_d AS (
      SELECT order_date::date as report_date, SUM(total_amount) as total
      FROM orders, bounds
      WHERE order_date >= bounds.start_day AND order_date < bounds.end_day ${branchFilter}
      GROUP BY 1
    ),
    returns_d AS (
      SELECT return_date::date as report_date, SUM(total_return_amount) as total
      FROM returns, bounds
      WHERE return_date >= bounds.start_day AND return_date < bounds.end_day ${branchFilter}
      GROUP BY 1
    ),
    fines_d AS (
      SELECT actual_return_date::date as report_date, SUM(fine_amount) as total
      FROM rentals, bounds
      WHERE actual_return_date >= bounds.start_day AND actual_return_date < bounds.end_day AND status = 'returned' ${branchFilter}
      GROUP BY 1
    ),
    rentals_d AS (
      SELECT booking_date::date as report_date, SUM(total_price) as total
      FROM rentals, bounds
      WHERE booking_date >= bounds.start_day AND booking_date < bounds.end_day ${branchFilter}
      GROUP BY 1
    ),
    tailoring_d AS (
      SELECT payment_date::date as report_date, SUM(amount) as total
      FROM tailoring_payments, bounds
      WHERE payment_date >= bounds.start_day AND payment_date < bounds.end_day ${branchFilter}
      GROUP BY 1
    ),
    expenses_d AS (
      SELECT expense_date::date as report_date, SUM(amount) as total
      FROM expenses, bounds
      WHERE category <> 'bonus' AND expense_date >= bounds.start_day AND expense_date < bounds.end_day ${branchFilter}
      GROUP BY 1
    ),
    salaries_d AS (
      SELECT et.transaction_date::date as report_date,
             COALESCE(SUM(${employeeTransactionReportAmountSql('et')}), 0) as total
      FROM employee_transactions et
      JOIN employees e ON e.id = et.employee_id
      JOIN branches eb ON eb.id = e.branch_id AND eb.is_main_warehouse = false
      CROSS JOIN bounds
      WHERE et.type IN ('salary_payment', 'advance', 'deduction', 'bonus')
        AND et.transaction_date >= bounds.start_day
        AND et.transaction_date < bounds.end_day
        ${employeeBranchFilter}
      GROUP BY 1
    ),
    cogs_d AS (
      SELECT o.order_date::date as report_date,
             SUM(oi.quantity * COALESCE(i.cost_price, 0)) as total
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN inventory i ON i.id = oi.inventory_id
      CROSS JOIN bounds
      WHERE o.order_date >= bounds.start_day AND o.order_date < bounds.end_day ${orderBranchFilter}
      GROUP BY 1
    ),
    return_cogs_d AS (
      SELECT r.return_date::date as report_date,
             SUM(ri.quantity * COALESCE(i.cost_price, 0)) as total
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      LEFT JOIN inventory i ON i.id = ri.inventory_id
      CROSS JOIN bounds
      WHERE r.return_date >= bounds.start_day AND r.return_date < bounds.end_day ${returnBranchFilter}
      GROUP BY 1
    )
    SELECT TO_CHAR(d.report_date, 'YYYY-MM-DD') as report_date,
           COALESCE(orders_d.total, 0) - COALESCE(returns_d.total, 0) as revenue,
           COALESCE(fines_d.total, 0) as fines,
           COALESCE(rentals_d.total, 0) as rentals,
           COALESCE(tailoring_d.total, 0) as tailoring,
           COALESCE(expenses_d.total, 0) as expenses,
           COALESCE(salaries_d.total, 0) as salaries,
           COALESCE(cogs_d.total, 0) - COALESCE(return_cogs_d.total, 0) as cogs
    FROM days d
    LEFT JOIN orders_d ON orders_d.report_date = d.report_date
    LEFT JOIN returns_d ON returns_d.report_date = d.report_date
    LEFT JOIN fines_d ON fines_d.report_date = d.report_date
    LEFT JOIN rentals_d ON rentals_d.report_date = d.report_date
    LEFT JOIN tailoring_d ON tailoring_d.report_date = d.report_date
    LEFT JOIN expenses_d ON expenses_d.report_date = d.report_date
    LEFT JOIN salaries_d ON salaries_d.report_date = d.report_date
    LEFT JOIN cogs_d ON cogs_d.report_date = d.report_date
    LEFT JOIN return_cogs_d ON return_cogs_d.report_date = d.report_date
    ORDER BY d.report_date DESC
  `;

  const { rows } = await db.query(sqlQuery, params);

  let history = rows.map(r => ({
    date: r.report_date,
    revenue: Number(r.revenue) + Number(r.rentals) + Number(r.fines) + Number(r.tailoring),
    sales_revenue: Number(r.revenue),
    rental_revenue: Number(r.rentals) + Number(r.fines),
    tailoring_revenue: Number(r.tailoring),
    expenses: Number(r.expenses),
    salaries: Number(r.salaries),
    cogs: Number(r.cogs),
    profit: (Number(r.revenue) + Number(r.rentals) + Number(r.fines) + Number(r.tailoring)) - (Number(r.expenses) + Number(r.salaries) + Number(r.cogs)),
  })).filter(day => day.revenue !== 0 || day.expenses !== 0 || day.salaries !== 0 || day.cogs !== 0);

  if (!canViewReportProfit(user)) {
    history = history.map(stripReportProfit);
  }

  return history;
}

async function getTopProductsReport(query = {}, user = null) {
  let month = query.month;
  if (!month) month = (await getDatabaseCairoNow(db)).month;

  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  let branchFilterSales = '';
  let branchFilterRentals = '';
  let range = getMonthRange(month);

  if (reportBranchId) {
    branchFilterSales = 'AND o.branch_id = $3';
    branchFilterRentals = 'AND r.branch_id = $3';
  }

  const dateConditionSales = 'o.order_date >= $1::date AND o.order_date < $2::date';
  const dateConditionRentals = 'r.booking_date >= $1::date AND r.booking_date < $2::date';

  if (query.date) {
    range = getDayRange(query.date);
  }
  const topParams = reportBranchId ? [range.start, range.end, reportBranchId] : [range.start, range.end];

  const [topSalesRes, topRentalsRes] = await Promise.all([
    db.query(
      `WITH lines AS (
         SELECT o.id as order_id,
                o.invoice_discount,
                o.invoice_discount_type,
                i.id as inventory_id,
                i.name,
                i.barcode,
                i.category,
                i.color,
                i.size_cut as size,
                b.name as branch_name,
                oi.quantity,
                GREATEST(
                  (oi.quantity * oi.price_at_time) -
                  CASE
                    WHEN oi.discount_type = 'percent' THEN (oi.quantity * oi.price_at_time) * (COALESCE(oi.discount, 0) / 100)
                    ELSE COALESCE(oi.discount, 0)
                  END,
                  0
                ) as line_net
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN inventory i ON oi.inventory_id = i.id
         LEFT JOIN branches b ON o.branch_id = b.id
         WHERE ${dateConditionSales} AND b.is_main_warehouse = false ${branchFilterSales}
       ),
       allocated AS (
         SELECT lines.*, SUM(line_net) OVER (PARTITION BY order_id) as order_net
         FROM lines
       )
       SELECT name, barcode, category, color, size, branch_name,
              SUM(quantity) as total_sold,
              SUM(GREATEST(
                line_net -
                CASE
                  WHEN order_net > 0 THEN
                    (
                      CASE
                        WHEN invoice_discount_type = 'percent' THEN order_net * (COALESCE(invoice_discount, 0) / 100)
                        ELSE LEAST(COALESCE(invoice_discount, 0), order_net)
                      END
                    ) * (line_net / order_net)
                  ELSE 0
                END,
                0
              )) as revenue
       FROM allocated
       GROUP BY inventory_id, name, barcode, category, color, size, branch_name
       ORDER BY total_sold DESC
       LIMIT 5`,
      topParams
    ),
    db.query(
      `SELECT i.name, i.barcode, i.category, i.color, i.size_cut as size, b.name as branch_name, COUNT(r.id) as times_rented, SUM(r.total_price) as rental_revenue
       FROM rentals r
       JOIN rental_inventory i ON r.rental_inventory_id = i.id
       LEFT JOIN branches b ON r.branch_id = b.id
       WHERE ${dateConditionRentals} AND b.is_main_warehouse = false ${branchFilterRentals}
       GROUP BY i.id, i.name, i.barcode, i.category, i.color, i.size_cut, b.name
       ORDER BY times_rented DESC
       LIMIT 5`,
      topParams
    ),
  ]);

  return {
    top_sales: topSalesRes.rows,
    top_rentals: topRentalsRes.rows,
  };
}

async function getDailyReport(query = {}, user = null) {
  let date = query.date;
  if (!date) date = (await getDatabaseCairoNow(db)).date;

  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const range = getDayRange(date);
  const params = [range.start, range.end];
  if (reportBranchId) {
    params.push(reportBranchId);
  }

  let branchQuery = 'SELECT id, name FROM branches WHERE is_main_warehouse = false';
  const bParams = [];
  if (reportBranchId) {
    branchQuery += ' AND id = $1';
    bParams.push(reportBranchId);
  }

  const branchesRes = await db.query(branchQuery, bParams);
  const branches = branchesRes.rows;
  const branchIds = branches.map(branch => Number(branch.id)).filter(Number.isFinite);
  let report = [];

  if (branchIds.length) {
    const reportParams = [branchIds, range.start, range.end];
    const [
      salesRes,
      finesRes,
      returnsRes,
      cogsRes,
      returnCogsRes,
      expensesRes,
      salariesRes,
      rentalsRes,
      tailoringRes,
      cashRes,
      inventoryValueRes,
    ] = await Promise.all([
      db.query(
        `SELECT branch_id, COALESCE(SUM(total_amount), 0) as total, COUNT(id)::int as count
         FROM orders
         WHERE branch_id = ANY($1::int[]) AND order_date >= $2::date AND order_date < $3::date
         GROUP BY branch_id`,
        reportParams
      ),
      db.query(
        `SELECT branch_id, COALESCE(SUM(fine_amount), 0) as total
         FROM rentals
         WHERE branch_id = ANY($1::int[]) AND actual_return_date >= $2::date AND actual_return_date < $3::date AND status = 'returned'
         GROUP BY branch_id`,
        reportParams
      ),
      db.query(
        `SELECT branch_id, COALESCE(SUM(total_return_amount), 0) as total, COUNT(id)::int as count
         FROM returns
         WHERE branch_id = ANY($1::int[]) AND return_date >= $2::date AND return_date < $3::date
         GROUP BY branch_id`,
        reportParams
      ),
      db.query(
        `SELECT o.branch_id, COALESCE(SUM(oi.quantity * COALESCE(i.cost_price, 0)), 0) as total
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         LEFT JOIN inventory i ON i.id = oi.inventory_id
         WHERE o.branch_id = ANY($1::int[]) AND o.order_date >= $2::date AND o.order_date < $3::date
         GROUP BY o.branch_id`,
        reportParams
      ),
      db.query(
        `SELECT r.branch_id, COALESCE(SUM(ri.quantity * COALESCE(i.cost_price, 0)), 0) as total
         FROM return_items ri
         JOIN returns r ON ri.return_id = r.id
         LEFT JOIN inventory i ON i.id = ri.inventory_id
         WHERE r.branch_id = ANY($1::int[]) AND r.return_date >= $2::date AND r.return_date < $3::date
         GROUP BY r.branch_id`,
        reportParams
      ),
      db.query(
        `SELECT branch_id, COALESCE(SUM(amount), 0) as total
         FROM expenses
         WHERE branch_id = ANY($1::int[]) AND category <> 'bonus' AND expense_date >= $2::date AND expense_date < $3::date
         GROUP BY branch_id`,
        reportParams
      ),
      db.query(
        `SELECT e.branch_id, COALESCE(SUM(${employeeTransactionReportAmountSql('et')}), 0) as total
         FROM employee_transactions et
         JOIN employees e ON e.id = et.employee_id
         WHERE e.branch_id = ANY($1::int[])
           AND et.type IN ('salary_payment', 'advance', 'deduction', 'bonus')
           AND et.transaction_date >= $2::date
           AND et.transaction_date < $3::date
         GROUP BY e.branch_id`,
        reportParams
      ),
      db.query(
        `SELECT branch_id, COALESCE(SUM(total_price), 0) as total, COUNT(id)::int as count
         FROM rentals
         WHERE branch_id = ANY($1::int[]) AND booking_date >= $2::date AND booking_date < $3::date
         GROUP BY branch_id`,
        reportParams
      ),
      db.query(
        `SELECT branch_id, COALESCE(SUM(amount), 0) as total, COUNT(id)::int as count
         FROM tailoring_payments
         WHERE branch_id = ANY($1::int[]) AND payment_date >= $2::date AND payment_date < $3::date
         GROUP BY branch_id`,
        reportParams
      ),
      db.query(
        `SELECT branch_id, COALESCE(SUM(total), 0) as total
         FROM (
           SELECT branch_id, total_amount as total
           FROM orders
           WHERE branch_id = ANY($1::int[])
             AND order_date >= $2::date
             AND order_date < $3::date
             AND ${normalizedPaymentMethodSql('payment_method')} = 'cash'
           UNION ALL
           SELECT branch_id, total_price as total
           FROM rentals
           WHERE branch_id = ANY($1::int[])
             AND booking_date >= $2::date
             AND booking_date < $3::date
             AND ${normalizedPaymentMethodSql('payment_method')} = 'cash'
           UNION ALL
           SELECT branch_id, fine_amount as total
           FROM rentals
           WHERE branch_id = ANY($1::int[])
             AND actual_return_date >= $2::date
             AND actual_return_date < $3::date
             AND status = 'returned'
             AND ${normalizedPaymentMethodSql('payment_method')} = 'cash'
           UNION ALL
           SELECT p.branch_id, p.amount as total
           FROM tailoring_payments p
           JOIN tailoring_orders t ON p.tailoring_order_id = t.id
           WHERE p.branch_id = ANY($1::int[])
             AND p.payment_date >= $2::date
             AND p.payment_date < $3::date
             AND ${normalizedPaymentMethodSql('t.payment_method')} = 'cash'
         ) cash_payments
         GROUP BY branch_id`,
        reportParams
      ),
      db.query(
        `SELECT ib.branch_id, COALESCE(SUM(i.cost_price * ib.stock_level), 0) as total
         FROM inventory_branches ib
         JOIN inventory i ON i.id = ib.inventory_id
         WHERE ib.branch_id = ANY($1::int[])
         GROUP BY ib.branch_id`,
        [branchIds]
      ),
    ]);

    const salesByBranch = rowsByBranch(salesRes.rows, row => ({ total: Number(row.total), count: Number(row.count) }));
    const finesByBranch = rowsByBranch(finesRes.rows, row => Number(row.total));
    const returnsByBranch = rowsByBranch(returnsRes.rows, row => ({ total: Number(row.total), count: Number(row.count) }));
    const cogsByBranch = rowsByBranch(cogsRes.rows, row => Number(row.total));
    const returnCogsByBranch = rowsByBranch(returnCogsRes.rows, row => Number(row.total));
    const expensesByBranch = rowsByBranch(expensesRes.rows, row => Number(row.total));
    const salariesByBranch = rowsByBranch(salariesRes.rows, row => Number(row.total));
    const rentalsByBranch = rowsByBranch(rentalsRes.rows, row => ({ total: Number(row.total), count: Number(row.count) }));
    const tailoringByBranch = rowsByBranch(tailoringRes.rows, row => ({ total: Number(row.total), count: Number(row.count) }));
    const cashByBranch = rowsByBranch(cashRes.rows, row => Number(row.total));
    const inventoryValueByBranch = rowsByBranch(inventoryValueRes.rows, row => Number(row.total));

    report = branches.map(branch => {
      const branchId = Number(branch.id);
      const sales = salesByBranch.get(branchId) || { total: 0, count: 0 };
      const returns = returnsByBranch.get(branchId) || { total: 0, count: 0 };
      const rentals = rentalsByBranch.get(branchId) || { total: 0, count: 0 };
      const tailoring = tailoringByBranch.get(branchId) || { total: 0, count: 0 };
      const total_sales = sales.total - returns.total;
      const cogs = (cogsByBranch.get(branchId) || 0) - (returnCogsByBranch.get(branchId) || 0);
      const expenses = expensesByBranch.get(branchId) || 0;
      const total_salaries_paid = salariesByBranch.get(branchId) || 0;
      const total_rentals = rentals.total + (finesByBranch.get(branchId) || 0);
      const total_tailoring = tailoring.total;
      const total_revenue = total_sales + total_rentals + total_tailoring;
      const cash_drawer = (cashByBranch.get(branchId) || 0) - returns.total - expenses;
      const net_profit = total_revenue - (cogs + expenses + total_salaries_paid);

      return {
        branch_id: branch.id,
        branch_name: branch.name,
        total_sales,
        order_count: sales.count,
        return_count: returns.count,
        cogs,
        expenses,
        total_salaries_paid,
        salaries: total_salaries_paid,
        total_rentals,
        total_tailoring,
        tailoring_count: tailoring.count,
        total_revenue,
        cash_drawer,
        rental_count: rentals.count,
        net_profit,
        total_inventory_value: inventoryValueByBranch.get(branchId) || 0,
      };
    });
  }

  const pFilter = reportBranchId ? 'AND branch_id = $3' : '';
  const paymentRes = await db.query(
    `SELECT payment_method, SUM(total) as total
     FROM (
       SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, total_amount as total
       FROM orders
       WHERE order_date >= $1::date AND order_date < $2::date ${pFilter}
       UNION ALL
       SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, total_price as total
       FROM rentals
       WHERE booking_date >= $1::date AND booking_date < $2::date ${pFilter}
       UNION ALL
       SELECT ${normalizedPaymentMethodSql('t.payment_method')} as payment_method, p.amount as total
       FROM tailoring_payments p
       JOIN tailoring_orders t ON p.tailoring_order_id = t.id
       WHERE p.payment_date >= $1::date AND p.payment_date < $2::date ${pFilter.replace('branch_id', 'p.branch_id')}
     ) payments
     GROUP BY payment_method`,
    params
  );

  const expenseReportParams = [branchIds, range.start, range.end];
  const [expenseItemsRes, salaryItemsRes, tailoringItemsRes] = branchIds.length ? await Promise.all([
    db.query(
      `SELECT e.id,
              TO_CHAR(e.expense_date, 'YYYY-MM-DD') as expense_date,
              COALESCE(NULLIF(e.category, ''), 'غير محدد') as category,
              COALESCE(e.amount, 0) as amount,
              COALESCE(e.notes, '') as notes,
              e.branch_id,
              COALESCE(b.name, '-') as branch_name
       FROM expenses e
       LEFT JOIN branches b ON e.branch_id = b.id
       WHERE e.branch_id = ANY($1::int[]) AND e.category <> 'bonus' AND e.expense_date >= $2::date AND e.expense_date < $3::date
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT 200`,
      expenseReportParams
    ),
    db.query(
      `WITH scoped_transactions AS (
         SELECT et.id,
                et.employee_id,
                et.type,
                et.amount,
                et.transaction_date,
                COALESCE(et.notes, '') as notes,
                e.basic_salary,
                e.name as employee_name,
                e.branch_id,
                COALESCE(b.name, '-') as branch_name,
                ${employeeTransactionReportAmountSql('et')} as report_amount,
                ${employeeTransactionRemainingDeltaSql('et')} as remaining_delta
         FROM employee_transactions et
         JOIN employees e ON e.id = et.employee_id
         LEFT JOIN branches b ON b.id = e.branch_id
         WHERE e.branch_id = ANY($1::int[])
           AND et.type IN ('salary_payment', 'advance', 'deduction', 'bonus')
           AND et.transaction_date >= DATE_TRUNC('month', $2::date)::date
           AND et.transaction_date < $3::date
       ),
       with_remaining AS (
         SELECT *,
                basic_salary - SUM(remaining_delta) OVER (
                  PARTITION BY employee_id, DATE_TRUNC('month', transaction_date)
                  ORDER BY transaction_date, id
                ) as remaining_salary
         FROM scoped_transactions
       )
       SELECT id,
              TO_CHAR(transaction_date, 'YYYY-MM-DD') as payment_date,
              type as transaction_type,
              amount,
              report_amount,
              remaining_salary,
              notes,
              employee_id,
              employee_name,
              branch_id,
              branch_name
       FROM with_remaining
       WHERE transaction_date >= $2::date AND transaction_date < $3::date
       ORDER BY transaction_date DESC, id DESC
       LIMIT 300`,
      expenseReportParams
    ),
    db.query(
      `SELECT p.id,
              t.invoice_number,
              t.customer_name,
              t.product_description,
              p.amount,
              t.total_amount,
              t.remaining_amount,
              p.branch_id,
              COALESCE(b.name, '-') as branch_name,
              TO_CHAR(p.payment_date, 'YYYY-MM-DD HH12:MI AM') as created_date,
              p.is_remainder
       FROM tailoring_payments p
       JOIN tailoring_orders t ON p.tailoring_order_id = t.id
       LEFT JOIN branches b ON p.branch_id = b.id
       WHERE p.branch_id = ANY($1::int[]) AND p.payment_date >= $2::date AND p.payment_date < $3::date
       ORDER BY p.payment_date DESC
       LIMIT 200`,
      expenseReportParams
    ),
  ]) : [{ rows: [] }, { rows: [] }, { rows: [] }];

  const expenseDetails = {
    total: report.reduce((sum, branchReport) => sum + Number(branchReport.expenses || 0), 0),
    items: expenseItemsRes.rows.map(row => ({
      ...row,
      amount: Number(row.amount || 0),
    })),
  };

  const salaryDetails = {
    total: report.reduce((sum, branchReport) => sum + Number(branchReport.total_salaries_paid || 0), 0),
    items: salaryItemsRes.rows.map(row => ({
      ...row,
      amount: Number(row.amount || 0),
      report_amount: Number(row.report_amount || 0),
      remaining_salary: Number(row.remaining_salary || 0),
    })),
  };

  const tailoringDetails = {
    total: report.reduce((sum, branchReport) => sum + Number(branchReport.total_tailoring || 0), 0),
    items: tailoringItemsRes.rows.map(row => ({
      ...row,
      amount: Number(row.amount || 0),
    })),
  };

  let branchFilterSales = '';
  let branchFilterRentals = '';
  const topParams = [range.start, range.end];
  if (reportBranchId) {
    branchFilterSales = 'AND o.branch_id = $3';
    branchFilterRentals = 'AND r.branch_id = $3';
    topParams.push(reportBranchId);
  }

  const [topSalesRes, topRentalsRes] = await Promise.all([
    db.query(
      `WITH lines AS (
         SELECT o.id as order_id,
                o.invoice_discount,
                o.invoice_discount_type,
                i.id as inventory_id,
                i.name,
                i.barcode,
                i.category,
                i.color,
                i.size_cut as size,
                b.name as branch_name,
                oi.quantity,
                GREATEST(
                  (oi.quantity * oi.price_at_time) -
                  CASE
                    WHEN oi.discount_type = 'percent' THEN (oi.quantity * oi.price_at_time) * (COALESCE(oi.discount, 0) / 100)
                    ELSE COALESCE(oi.discount, 0)
                  END,
                  0
                ) as line_net
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         JOIN inventory i ON oi.inventory_id = i.id
         LEFT JOIN branches b ON o.branch_id = b.id
         WHERE o.order_date >= $1::date AND o.order_date < $2::date AND b.is_main_warehouse = false ${branchFilterSales}
       ),
       allocated AS (
         SELECT lines.*, SUM(line_net) OVER (PARTITION BY order_id) as order_net
         FROM lines
       )
       SELECT name, barcode, category, color, size, branch_name,
              SUM(quantity) as total_sold,
              SUM(GREATEST(
                line_net -
                CASE
                  WHEN order_net > 0 THEN
                    (
                      CASE
                        WHEN invoice_discount_type = 'percent' THEN order_net * (COALESCE(invoice_discount, 0) / 100)
                        ELSE LEAST(COALESCE(invoice_discount, 0), order_net)
                      END
                    ) * (line_net / order_net)
                  ELSE 0
                END,
                0
              )) as revenue
       FROM allocated
       GROUP BY inventory_id, name, barcode, category, color, size, branch_name
       ORDER BY total_sold DESC
       LIMIT 5`,
      topParams
    ),
    db.query(
      `SELECT i.name, i.barcode, i.category, i.color, i.size_cut as size, b.name as branch_name, COUNT(r.id) as times_rented, SUM(r.total_price) as rental_revenue
       FROM rentals r
       JOIN rental_inventory i ON r.rental_inventory_id = i.id
       LEFT JOIN branches b ON r.branch_id = b.id
       WHERE r.booking_date >= $1::date AND r.booking_date < $2::date AND b.is_main_warehouse = false ${branchFilterRentals}
       GROUP BY i.id, i.name, i.barcode, i.category, i.color, i.size_cut, b.name
       ORDER BY times_rented DESC
       LIMIT 5`,
      topParams
    ),
  ]);

  const canViewProfit = canViewReportProfit(user);
  const branchFilterAttendance = reportBranchId ? 'AND e.branch_id = $3' : '';

  const [attendanceRes, salesInvoicesRes, rentalInvoicesRes] = await Promise.all([
    db.query(
      `SELECT a.employee_id, e.name as employee_name, b.name as branch_name, TO_CHAR(a.date, 'YYYY-MM-DD') as date, TO_CHAR(a.check_in, 'HH12:MI AM') as check_in, TO_CHAR(a.check_out, 'HH12:MI AM') as check_out, a.total_hours, a.notes
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN branches b ON e.branch_id = b.id
       WHERE a.date >= $1::date AND a.date < $2::date ${branchFilterAttendance}
       ORDER BY a.date DESC`,
      topParams
    ),
    db.query(
      `SELECT COALESCE(o.branch_invoice_number, o.id) as invoice_number, o.total_amount as amount, o.paid_amount, GREATEST(o.total_amount - o.paid_amount - COALESCE(o.invoice_discount,0), 0) as remainder, e.name as cashier_name, o.payment_method, TO_CHAR(o.order_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'sales' as invoice_type
       FROM orders o
       LEFT JOIN employees e ON o.seller_id = e.id
       WHERE o.branch_id = ANY($1::int[]) AND o.order_date >= $2::date AND o.order_date < $3::date
       ORDER BY o.order_date DESC LIMIT 500`,
      expenseReportParams
    ),
    db.query(
      `SELECT r.id as invoice_number, r.total_price as amount, r.deposit as paid_amount, r.remaining as remainder, e.name as cashier_name, r.payment_method, TO_CHAR(r.booking_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'rental' as invoice_type
       FROM rentals r
       LEFT JOIN employees e ON r.seller_id = e.id
       WHERE r.branch_id = ANY($1::int[]) AND r.booking_date >= $2::date AND r.booking_date < $3::date
       ORDER BY r.booking_date DESC LIMIT 500`,
      expenseReportParams
    ),
  ]);

  return {
    date,
    branch_sales: canViewProfit ? report : report.map(stripReportProfit),
    payments: paymentRes.rows,
    expenses: expenseDetails,
    salaries: salaryDetails,
    tailoring: tailoringDetails,
    attendance: attendanceRes.rows,
    sales_invoices: salesInvoicesRes.rows,
    rental_invoices: rentalInvoicesRes.rows,
    top_sales: topSalesRes.rows,
    top_rentals: topRentalsRes.rows,
  };
}

module.exports = {
  getDashboard,
  getTopProductsByBranch,
  getProfitReport,
  getMonthlyHistory,
  getDailyHistory,
  getTopProductsReport,
  getDailyReport,
};
