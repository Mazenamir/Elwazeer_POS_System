const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const { getDatabaseCairoNow, getMonthRange, addDays } = require('../../../shared/utils/date');
const {
  getReportBranchId,
  canViewReportProfit,
  stripReportProfit,
  employeeTransactionReportAmountSql,
  employeeTransactionRemainingDeltaSql,
  normalizedPaymentMethodSql,
  rowsByBranch,
  getDayRange,
  parseReportDateRange,
  sanitizeFormulaValue,
  formatCairoDateTime,
} = require('./reports.helpers');
const { hasPermission } = require('../../../shared/constants/permissions');

async function getDashboard(query = {}, user = null) {
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  if (user.role !== 'admin' && !hasPermission(user, 'Dashboard.html')) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  let branchId = null;
  const params = [];
  if (user && user.role !== 'admin') {
    if (!user.branch_id) {
      const err = new Error('Branch user must have a branch_id');
      err.statusCode = 403;
      throw err;
    }
    branchId = String(user.branch_id);
  } else if (query.branch_id && query.branch_id !== 'all') {
    branchId = String(query.branch_id);
  }

  let branchFilter = '';
  if (branchId) {
    params.push(branchId);
    branchFilter = 'WHERE branch_id = $1';
  }
  const whereAnd = branchFilter ? branchFilter + ' AND' : 'WHERE';

  const range = query.range || '7days';
  let startSql = `(${CAIRO_DATE_SQL} - INTERVAL '6 days')`;
  let endSql = `(${CAIRO_DATE_SQL} + INTERVAL '1 day')`;
  let dateOnlyStartSql = `(${CAIRO_DATE_SQL} - INTERVAL '6 days')::date`;
  let dateOnlyEndSql = `${CAIRO_DATE_SQL}::date`;
  let rangeLabel = 'آخر 7 أيام';

  if (range === 'today') {
    startSql = `${CAIRO_DATE_SQL}`;
    endSql = `(${CAIRO_DATE_SQL} + INTERVAL '1 day')`;
    dateOnlyStartSql = `${CAIRO_DATE_SQL}::date`;
    dateOnlyEndSql = `${CAIRO_DATE_SQL}::date`;
    rangeLabel = 'اليوم';
  } else if (range === 'yesterday') {
    startSql = `(${CAIRO_DATE_SQL} - INTERVAL '1 day')`;
    endSql = `${CAIRO_DATE_SQL}`;
    dateOnlyStartSql = `(${CAIRO_DATE_SQL} - INTERVAL '1 day')::date`;
    dateOnlyEndSql = `(${CAIRO_DATE_SQL} - INTERVAL '1 day')::date`;
    rangeLabel = 'أمس';
  } else if (range === 'this_month') {
    startSql = `DATE_TRUNC('month', ${CAIRO_DATE_SQL})`;
    endSql = `(${CAIRO_DATE_SQL} + INTERVAL '1 day')`;
    dateOnlyStartSql = `DATE_TRUNC('month', ${CAIRO_DATE_SQL})::date`;
    dateOnlyEndSql = `${CAIRO_DATE_SQL}::date`;
    rangeLabel = 'هذا الشهر';
  } else if (range === '30days') {
    startSql = `(${CAIRO_DATE_SQL} - INTERVAL '29 days')`;
    endSql = `(${CAIRO_DATE_SQL} + INTERVAL '1 day')`;
    dateOnlyStartSql = `(${CAIRO_DATE_SQL} - INTERVAL '29 days')::date`;
    dateOnlyEndSql = `${CAIRO_DATE_SQL}::date`;
    rangeLabel = 'آخر 30 يوماً';
  }

  const [
    totalSalesRes,
    dailyReturnsRes,
    totalRentalsRes,
    totalFinesRes,
    totalTailoringRes,
    cogsRes,
    returnCogsRes,
    totalExpensesRes,
    salariesRes,
    ordersCountRes,
    newCustomersRes,
  ] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders ${whereAnd} status <> 'cancelled' AND order_date >= ${startSql} AND order_date < ${endSql}`, params),
    db.query(`SELECT COALESCE(SUM(total_return_amount), 0) as total FROM returns ${whereAnd} return_date >= ${startSql} AND return_date < ${endSql}`, params),
    db.query(`SELECT COALESCE(SUM(total_price), 0) as total FROM rentals ${whereAnd} status <> 'cancelled' AND booking_date >= ${startSql} AND booking_date < ${endSql}`, params),
    db.query(`SELECT COALESCE(SUM(fine_amount), 0) as total FROM rentals ${whereAnd} actual_return_date >= ${startSql} AND actual_return_date < ${endSql} AND status = 'returned'`, params),
    db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM tailoring_payments ${whereAnd} payment_date >= ${startSql} AND payment_date < ${endSql}`, params),
    db.query(`SELECT COALESCE(SUM(oi.quantity * COALESCE(i.cost_price, 0)), 0) as total FROM order_items oi JOIN orders o ON oi.order_id = o.id LEFT JOIN inventory i ON oi.inventory_id = i.id WHERE o.status <> 'cancelled' ${branchId ? 'AND o.branch_id = $1' : ''} AND o.order_date >= ${startSql} AND o.order_date < ${endSql}`, params),
    db.query(`SELECT COALESCE(SUM(ri.quantity * COALESCE(i.cost_price, 0)), 0) as total FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN inventory i ON ri.inventory_id = i.id ${branchId ? 'WHERE r.branch_id = $1 AND' : 'WHERE'} r.return_date >= ${startSql} AND r.return_date < ${endSql}`, params),
    db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses ${whereAnd} category <> 'bonus' AND expense_date >= ${dateOnlyStartSql} AND expense_date <= ${dateOnlyEndSql} AND is_deleted IS NOT TRUE`, params),
    db.query(`SELECT COALESCE(SUM(${employeeTransactionReportAmountSql('et')}), 0) as total FROM employee_transactions et JOIN employees e ON e.id = et.employee_id WHERE et.type IN ('salary_payment', 'advance', 'deduction', 'bonus') AND et.transaction_date >= ${dateOnlyStartSql} AND et.transaction_date <= ${dateOnlyEndSql} ${branchId ? 'AND e.branch_id = $1' : ''}`, params),
    db.query(`SELECT COUNT(*) as count FROM orders ${whereAnd} status <> 'cancelled' AND order_date >= ${startSql} AND order_date < ${endSql}`, params),
    db.query(`SELECT COUNT(*) as count FROM customers ${whereAnd} join_date >= ${dateOnlyStartSql} AND join_date <= ${dateOnlyEndSql}`, params),
  ]);

  const totalReturns = Number(dailyReturnsRes.rows[0]?.total) || 0;
  const netSales = (Number(totalSalesRes.rows[0]?.total) || 0) - totalReturns;
  const rentals = (Number(totalRentalsRes.rows[0]?.total) || 0) + (Number(totalFinesRes.rows[0]?.total) || 0);
  const tailoring = Number(totalTailoringRes.rows[0]?.total) || 0;
  const totalRevenuePeriod = netSales + rentals + tailoring;

  const cogsPeriod = Number(cogsRes.rows[0]?.total || 0) - Number(returnCogsRes.rows[0]?.total || 0);
  const totalExpenses = Number(totalExpensesRes.rows[0]?.total) || 0;
  const totalSalaries = Number(salariesRes.rows[0]?.total) || 0;
  const netProfitPeriod = totalRevenuePeriod - totalExpenses - totalSalaries - cogsPeriod;


  let lowStockQuery = `
    SELECT COUNT(*) as count 
    FROM inventory_branches ib
    JOIN inventory i ON ib.inventory_id = i.id
    WHERE ib.stock_level <= COALESCE(i.min_stock_level, 5)
  `;
  if (branchFilter) lowStockQuery += ' AND ib.branch_id = $1';
  const lowStockRes = await db.query(lowStockQuery, params);

  // Recent orders query - prefer orders within range, fallback to latest overall
  const recentOrdersInPeriodRes = await db.query(`
    SELECT o.id, o.id as invoice_number, c.name as customer_name, b.name as branch_name,
           o.order_date, o.order_date as created_at, o.status, o.total_amount
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN branches b ON o.branch_id = b.id
    WHERE o.status <> 'cancelled'
    ${branchId ? 'AND o.branch_id = $1' : ''}
    AND o.order_date >= ${startSql} AND o.order_date < ${endSql}
    ORDER BY o.order_date DESC
    LIMIT 8
  `, params);

  let recentOrders = recentOrdersInPeriodRes.rows;
  if (recentOrders.length === 0) {
    const recentOrdersFallbackRes = await db.query(`
      SELECT o.id, o.id as invoice_number, c.name as customer_name, b.name as branch_name,
             o.order_date, o.order_date as created_at, o.status, o.total_amount
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN branches b ON o.branch_id = b.id
      WHERE o.status <> 'cancelled'
      ${branchId ? 'AND o.branch_id = $1' : ''}
      ORDER BY o.order_date DESC
      LIMIT 8
    `, params);
    recentOrders = recentOrdersFallbackRes.rows;
  }

  // Top products within range, fallback to overall top products if none in range
  const topProductsPeriodRes = await db.query(`
    SELECT i.id, i.name, i.category, i.image_url as image, i.price,
           SUM(oi.quantity) as sales,
           SUM(oi.quantity) as total_sold,
           SUM(oi.quantity) as quantity,
           COALESCE(SUM(oi.quantity * COALESCE(oi.price_at_time, i.price, 0)), 0) as total_revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN inventory i ON oi.inventory_id = i.id
    WHERE o.status <> 'cancelled'
    ${branchId ? 'AND o.branch_id = $1' : ''}
    AND o.order_date >= ${startSql} AND o.order_date < ${endSql}
    GROUP BY i.id, i.name, i.category, i.image_url, i.price
    ORDER BY sales DESC
    LIMIT 10
  `, params);

  let topProducts = topProductsPeriodRes.rows;
  if (topProducts.length === 0) {
    const topProductsFallbackRes = await db.query(`
      SELECT i.id, i.name, i.category, i.image_url as image, i.price,
             SUM(oi.quantity) as sales,
             SUM(oi.quantity) as total_sold,
             SUM(oi.quantity) as quantity,
             COALESCE(SUM(oi.quantity * COALESCE(oi.price_at_time, i.price, 0)), 0) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN inventory i ON oi.inventory_id = i.id
      WHERE o.status <> 'cancelled'
      ${branchId ? 'AND o.branch_id = $1' : ''}
      GROUP BY i.id, i.name, i.category, i.image_url, i.price
      ORDER BY sales DESC
      LIMIT 10
    `, params);
    topProducts = topProductsFallbackRes.rows;
  }

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
      LEFT JOIN orders o ON o.status <> 'cancelled' AND o.order_date >= h AND o.order_date < h + INTERVAL '1 hour' ${branchFilter ? 'AND o.branch_id = $1' : ''}
      GROUP BY h
      ORDER BY h ASC
    `;
  } else if (range === 'yesterday') {
    revenueTrendQuery = `
      SELECT 
        TO_CHAR(h, 'HH24:00') as day, 
        COALESCE(SUM(o.total_amount), 0) - COALESCE((
          SELECT SUM(total_return_amount) 
          FROM returns r 
          WHERE r.return_date >= h AND r.return_date < h + INTERVAL '1 hour' ${branchFilter ? 'AND r.branch_id = $1' : ''}
        ), 0) as total, 
        h as date_val
      FROM generate_series((${CAIRO_DATE_SQL} - INTERVAL '1 day')::timestamp, (${CAIRO_DATE_SQL} - INTERVAL '1 day')::timestamp + INTERVAL '23 hours', '1 hour') h
      LEFT JOIN orders o ON o.status <> 'cancelled' AND o.order_date >= h AND o.order_date < h + INTERVAL '1 hour' ${branchFilter ? 'AND o.branch_id = $1' : ''}
      GROUP BY h
      ORDER BY h ASC
    `;
  } else if (range === 'this_month') {
    revenueTrendQuery = `
      SELECT 
        TO_CHAR(d, 'DD/MM') as day, 
        COALESCE(SUM(o.total_amount), 0) - COALESCE((
          SELECT SUM(total_return_amount) 
          FROM returns r 
          WHERE r.return_date >= d AND r.return_date < d + INTERVAL '1 day' ${branchFilter ? 'AND r.branch_id = $1' : ''}
        ), 0) as total, 
        d as date_val
      FROM generate_series(DATE_TRUNC('month', ${CAIRO_DATE_SQL}), ${CAIRO_DATE_SQL}, '1 day') d
      LEFT JOIN orders o ON o.status <> 'cancelled' AND o.order_date >= d AND o.order_date < d + INTERVAL '1 day' ${branchFilter ? 'AND o.branch_id = $1' : ''}
      GROUP BY d
      ORDER BY d ASC
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
      LEFT JOIN orders o ON o.status <> 'cancelled' AND o.order_date >= d AND o.order_date < d + INTERVAL '1 day' ${branchFilter ? 'AND o.branch_id = $1' : ''}
      GROUP BY d
      ORDER BY d ASC
    `;
  } else {
    // 7days
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
      LEFT JOIN orders o ON o.status <> 'cancelled' AND o.order_date >= d AND o.order_date < d + INTERVAL '1 day' ${branchFilter ? 'AND o.branch_id = $1' : ''}
      GROUP BY d
      ORDER BY d ASC
    `;
  }

  const revenueTrendRes = await db.query(revenueTrendQuery, params);

  return {
    range,
    rangeLabel,
    totalSales: totalRevenuePeriod,
    totalExpenses: totalExpenses,
    ordersToday: ordersCountRes.rows[0]?.count || 0,
    ordersCount: ordersCountRes.rows[0]?.count || 0,
    newCustomers: newCustomersRes.rows[0]?.count || 0,
    lowStock: lowStockRes.rows[0]?.count || 0,
    dailyReturns: totalReturns,
    totalReturns: totalReturns,
    netProfit: netProfitPeriod,
    recentOrders,
    topProducts,
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
  const range = parseReportDateRange(query);
  const month = range.month || query.month || (await getDatabaseCairoNow(db)).month;

  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  let branchQuery = 'SELECT id, name FROM branches';
  const params = [];
  if (reportBranchId) {
    branchQuery += ' WHERE id = $1';
    params.push(reportBranchId);
  }

  const branchesRes = await db.query(branchQuery, params);
  const branches = branchesRes.rows;
  const branchIds = branches.map(branch => Number(branch.id)).filter(Number.isFinite);

  if (branchIds.length === 0) {
    const emptySummary = {
      total_sales: 0,
      total_rentals: 0,
      total_tailoring: 0,
      total_revenue: 0,
      revenue: 0,
      cash_drawer: 0,
      cogs: 0,
      gross_profit: 0,
      expenses: 0,
      total_salaries_paid: 0,
      salaries: 0,
      net_profit: 0,
      profit_margin: 0,
      total_inventory_value: 0,
    };
    return {
      month,
      date_from: range.dateFrom,
      date_to: range.dateTo,
      revenue: 0,
      cogs: 0,
      gross_profit: 0,
      expenses: 0,
      net_profit: 0,
      profit_margin: 0,
      branch_reports: [],
      summary: canViewReportProfit(user) ? emptySummary : stripReportProfit(emptySummary),
      payments: [],
      expenses_details: { total: 0, items: [] },
      salaries_details: { total: 0, items: [] },
      tailoring_details: { total: 0, items: [] },
      attendance: [],
      sales_invoices: [],
      rental_invoices: [],
    };
  }

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
       WHERE branch_id = ANY($1::int[]) AND status <> 'cancelled' AND order_date >= $2::date AND order_date < $3::date
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
       WHERE o.branch_id = ANY($1::int[]) AND o.status <> 'cancelled' AND o.order_date >= $2::date AND o.order_date < $3::date
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
      `SELECT branch_id,
              COALESCE(SUM(amount), 0) as total,
              COALESCE(SUM(CASE WHEN COALESCE(payment_method, 'cash') = 'cash' THEN amount ELSE 0 END), 0) as cash_total
       FROM expenses
       WHERE branch_id = ANY($1::int[]) AND category <> 'bonus' AND expense_date >= $2::date AND expense_date < $3::date AND is_deleted IS NOT TRUE
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
       WHERE branch_id = ANY($1::int[]) AND status <> 'cancelled' AND booking_date >= $2::date AND booking_date < $3::date
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
         SELECT branch_id, paid_amount as total
         FROM orders
         WHERE branch_id = ANY($1::int[])
           AND status <> 'cancelled'
           AND order_date >= $2::date
           AND order_date < $3::date
           AND ${normalizedPaymentMethodSql('payment_method')} = 'cash'
         UNION ALL
         SELECT branch_id, deposit as total
         FROM rentals
         WHERE branch_id = ANY($1::int[])
           AND status <> 'cancelled'
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
  const cashExpensesByBranch = rowsByBranch(expensesRes.rows, row => Number(row.cash_total));
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
    const cash_expenses = cashExpensesByBranch.get(branchId) || 0;
    const total_salaries_paid = salariesByBranch.get(branchId) || 0;
    const total_rentals = (rentalsByBranch.get(branchId) || 0) + (finesByBranch.get(branchId) || 0);
    const total_tailoring = tailoringByBranch.get(branchId) || 0;
    const total_revenue = total_sales + total_rentals + total_tailoring;
    const cash_drawer = (cashByBranch.get(branchId) || 0) - total_returns - cash_expenses;
    const gross_profit = total_revenue - cogs;
    const net_profit = total_revenue - (cogs + expenses + total_salaries_paid);
    const profit_margin = total_revenue > 0 ? (net_profit / total_revenue) * 100 : 0;

    return {
      branch_id: branch.id,
      branch_name: branch.name,
      total_sales,
      sales: total_sales,
      total_rentals,
      rentals: total_rentals,
      total_tailoring,
      tailoring: total_tailoring,
      total_revenue,
      revenue: total_revenue,
      cash_drawer,
      cash_in_drawer: cash_drawer,
      net_cash: cash_drawer,
      cogs,
      gross_profit,
      expenses,
      total_salaries_paid,
      salaries: total_salaries_paid,
      net_profit,
      profit: net_profit,
      profit_margin,
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

  const gross_profit = summary.total_revenue - summary.cogs;
  const net_profit = summary.net_profit;
  const profit_margin = summary.total_revenue > 0 ? (net_profit / summary.total_revenue) * 100 : 0;

  summary.revenue = summary.total_revenue;
  summary.sales = summary.total_sales;
  summary.rentals = summary.total_rentals;
  summary.tailoring = summary.total_tailoring;
  summary.salaries = summary.total_salaries_paid;
  summary.gross_profit = gross_profit;
  summary.profit = net_profit;
  summary.profit_margin = profit_margin;
  summary.cash_in_drawer = summary.cash_drawer;
  summary.net_cash = summary.cash_drawer;

  const paymentParams = reportBranchId ? [range.start, range.end, reportBranchId] : [range.start, range.end];
  const paymentBranchFilter = reportBranchId ? ' AND branch_id = $3' : '';

  const [paymentRes, expenseItemsRes, salaryItemsRes, tailoringItemsRes] = await Promise.all([
    db.query(
      `SELECT payment_method, SUM(total) as total
       FROM (
         SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, total_amount as total
         FROM orders
         WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date${paymentBranchFilter}
         UNION ALL
         SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, total_price as total
         FROM rentals
         WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date${paymentBranchFilter}
         UNION ALL
         SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, fine_amount as total
         FROM rentals
         WHERE status = 'returned' AND actual_return_date >= $1::date AND actual_return_date < $2::date${paymentBranchFilter}
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
      `SELECT COALESCE(o.branch_invoice_number, o.id) as invoice_number, o.total_amount as amount, o.paid_amount, GREATEST(o.total_amount - o.paid_amount, 0) as remainder, e.name as cashier_name, o.payment_method, TO_CHAR(o.order_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'sales' as invoice_type
       FROM orders o
       LEFT JOIN employees e ON o.seller_id = e.id
       WHERE o.branch_id = ANY($1::int[]) AND o.status <> 'cancelled' AND o.order_date >= $2::date AND o.order_date < $3::date
       ORDER BY o.order_date DESC LIMIT 1500`,
      reportParams
    ),
    db.query(
      `SELECT r.id as invoice_number, r.total_price as amount, r.deposit as paid_amount, r.remaining as remainder, r.status, e.name as cashier_name, r.payment_method, TO_CHAR(r.booking_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'rental' as invoice_type
       FROM rentals r
       LEFT JOIN employees e ON r.seller_id = e.id
       WHERE r.branch_id = ANY($1::int[]) AND r.status <> 'cancelled' AND r.booking_date >= $2::date AND r.booking_date < $3::date
       ORDER BY r.booking_date DESC LIMIT 1500`,
      reportParams
    ),
  ]);

  const canViewProfit = canViewReportProfit(user);

  return {
    month: range.month || month,
    date_from: range.dateFrom,
    date_to: range.dateTo,
    revenue: summary.total_revenue,
    total_revenue: summary.total_revenue,
    total_sales: summary.total_sales,
    sales: summary.total_sales,
    total_rentals: summary.total_rentals,
    rentals: summary.total_rentals,
    total_tailoring: summary.total_tailoring,
    tailoring: summary.total_tailoring,
    cogs: summary.cogs,
    gross_profit,
    expenses: summary.expenses,
    salaries: summary.total_salaries_paid,
    total_salaries_paid: summary.total_salaries_paid,
    cash_drawer: summary.cash_drawer,
    cash_in_drawer: summary.cash_drawer,
    net_cash: summary.cash_drawer,
    net_profit,
    profit: net_profit,
    profit_margin,
    branch_reports: canViewProfit ? report : report.map(stripReportProfit),
    summary: canViewProfit ? summary : stripReportProfit(summary),
    payments: paymentRes.rows,
    expenses_details: expenseDetails,
    salaries_details: salaryDetails,
    tailoring_details: tailoringDetails,
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

  let fMonth = query.from_month && /^\d{4}-\d{2}$/.test(query.from_month) ? query.from_month : null;
  let tMonth = query.to_month && /^\d{4}-\d{2}$/.test(query.to_month) ? query.to_month : null;
  if (fMonth && tMonth && fMonth > tMonth) {
    const tmp = fMonth;
    fMonth = tMonth;
    tMonth = tmp;
  }
  const fromMonth = fMonth ? fMonth + '-01' : null;
  const toMonth = tMonth ? tMonth + '-01' : null;

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
      WHERE status <> 'cancelled' AND order_date >= bounds.start_month AND order_date < bounds.end_month ${branchFilter}
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
      WHERE status <> 'cancelled' AND booking_date >= bounds.start_month AND booking_date < bounds.end_month ${branchFilter}
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
      WHERE category <> 'bonus' AND expense_date >= bounds.start_month AND expense_date < bounds.end_month AND is_deleted IS NOT TRUE ${branchFilter}
      GROUP BY 1
    ),
    salaries_m AS (
      SELECT DATE_TRUNC('month', et.transaction_date)::date as month_start,
             COALESCE(SUM(${employeeTransactionReportAmountSql('et')}), 0) as total
      FROM employee_transactions et
      JOIN employees e ON e.id = et.employee_id
      JOIN branches eb ON eb.id = e.branch_id
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
      WHERE o.status <> 'cancelled' AND o.order_date >= bounds.start_month AND o.order_date < bounds.end_month ${orderBranchFilter}
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

  let history = rows.map(r => {
    const totalRev = Number(r.revenue) + Number(r.rentals) + Number(r.fines) + Number(r.tailoring);
    const sales = Number(r.revenue);
    const rentals = Number(r.rentals) + Number(r.fines);
    const tailoring = Number(r.tailoring);
    const expenses = Number(r.expenses);
    const salaries = Number(r.salaries);
    const cogs = Number(r.cogs);
    const profit = totalRev - (expenses + salaries + cogs);
    const grossProfit = totalRev - cogs;
    return {
      month: r.month_str,
      revenue: totalRev,
      total_revenue: totalRev,
      sales,
      sales_revenue: sales,
      rentals,
      rental_revenue: rentals,
      tailoring,
      tailoring_revenue: tailoring,
      expenses,
      salaries,
      cogs,
      gross_profit: grossProfit,
      net_profit: profit,
      profit,
    };
  }).filter(m => m.revenue !== 0 || m.expenses !== 0 || m.salaries !== 0 || m.cogs !== 0 || m.month === cairoNow.month);

  if (!canViewReportProfit(user)) {
    history = history.map(stripReportProfit);
  }

  return history;
}

async function getDailyHistory(query = {}, user = null) {
  const range = parseReportDateRange(query);
  const requestedDays = Number.parseInt(query.days, 10);
  const days = Number.isInteger(requestedDays) ? Math.max(1, Math.min(requestedDays, 365)) : 30;

  let startDay = range.dateFrom;
  let currentDay = range.dateTo;
  let endDay = range.end;

  if (!range.isCustomRange && !query.month && !query.date && requestedDays > 0) {
    startDay = addDays(currentDay, -(days - 1));
  }

  const startDayExpr = `'${startDay}'::date`;
  const endDayExpr = `'${endDay}'::date`;
  const currentDayExpr = `'${currentDay}'::date`;

  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

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
      WHERE status <> 'cancelled' AND order_date >= bounds.start_day AND order_date < bounds.end_day ${branchFilter}
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
      WHERE status <> 'cancelled' AND booking_date >= bounds.start_day AND booking_date < bounds.end_day ${branchFilter}
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
      WHERE category <> 'bonus' AND expense_date >= bounds.start_day AND expense_date < bounds.end_day AND is_deleted IS NOT TRUE ${branchFilter}
      GROUP BY 1
    ),
    salaries_d AS (
      SELECT et.transaction_date::date as report_date,
             COALESCE(SUM(${employeeTransactionReportAmountSql('et')}), 0) as total
      FROM employee_transactions et
      JOIN employees e ON e.id = et.employee_id
      JOIN branches eb ON eb.id = e.branch_id
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
      WHERE o.status <> 'cancelled' AND o.order_date >= bounds.start_day AND o.order_date < bounds.end_day ${orderBranchFilter}
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

  let history = rows.map(r => {
    const totalRev = Number(r.revenue) + Number(r.rentals) + Number(r.fines) + Number(r.tailoring);
    const sales = Number(r.revenue);
    const rentals = Number(r.rentals) + Number(r.fines);
    const tailoring = Number(r.tailoring);
    const expenses = Number(r.expenses);
    const salaries = Number(r.salaries);
    const cogs = Number(r.cogs);
    const net_profit = totalRev - (expenses + salaries + cogs);
    const gross_profit = totalRev - cogs;
    return {
      date: r.report_date,
      revenue: totalRev,
      total_revenue: totalRev,
      sales,
      sales_revenue: sales,
      rentals,
      rental_revenue: rentals,
      tailoring,
      tailoring_revenue: tailoring,
      expenses,
      salaries,
      cogs,
      gross_profit,
      net_profit,
      profit: net_profit,
    };
  }).filter(day => day.revenue !== 0 || day.expenses !== 0 || day.salaries !== 0 || day.cogs !== 0);

  if (!canViewReportProfit(user)) {
    history = history.map(stripReportProfit);
  }

  return history;
}

async function getTopProductsReport(query = {}, user = null) {
  const range = parseReportDateRange(query);
  const limit = Math.max(1, Math.min(Number.parseInt(query.limit, 10) || 20, 100));

  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  let branchFilterSales = '';
  let branchFilterRentals = '';

  if (reportBranchId) {
    branchFilterSales = 'AND o.branch_id = $3';
    branchFilterRentals = 'AND r.branch_id = $3';
  }

  const dateConditionSales = 'o.status <> \'cancelled\' AND o.order_date >= $1::date AND o.order_date < $2::date';
  const dateConditionRentals = 'r.status <> \'cancelled\' AND r.booking_date >= $1::date AND r.booking_date < $2::date';

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
         WHERE ${dateConditionSales} ${branchFilterSales}
       ),
       allocated AS (
         SELECT lines.*, SUM(line_net) OVER (PARTITION BY order_id) as order_net
         FROM lines
       )
       SELECT inventory_id as id, inventory_id, name, barcode, category, color, size, branch_name,
              SUM(quantity)::int as total_sold,
              SUM(quantity)::int as quantity_sold,
              SUM(quantity)::int as total_quantity,
              ROUND(SUM(GREATEST(
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
              )), 2) as revenue,
              ROUND(SUM(GREATEST(
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
              )), 2) as total_revenue
       FROM allocated
       GROUP BY inventory_id, name, barcode, category, color, size, branch_name
       ORDER BY total_sold DESC
       LIMIT ${limit}`,
      topParams
    ),
    db.query(
      `SELECT i.id, i.name, i.barcode, i.category, i.color, i.size_cut as size, b.name as branch_name,
              COUNT(r.id)::int as times_rented,
              ROUND(COALESCE(SUM(r.total_price), 0), 2) as rental_revenue,
              ROUND(COALESCE(SUM(r.total_price), 0), 2) as total_revenue
       FROM rentals r
       JOIN rental_inventory i ON r.rental_inventory_id = i.id
       LEFT JOIN branches b ON r.branch_id = b.id
       WHERE ${dateConditionRentals} ${branchFilterRentals}
       GROUP BY i.id, i.name, i.barcode, i.category, i.color, i.size_cut, b.name
       ORDER BY times_rented DESC
       LIMIT ${limit}`,
      topParams
    ),
  ]);

  const topSales = topSalesRes.rows.map(r => ({
    ...r,
    id: r.id || r.inventory_id,
    total_sold: Number(r.total_sold || 0),
    quantity_sold: Number(r.quantity_sold || r.total_sold || 0),
    total_quantity: Number(r.total_quantity || r.total_sold || 0),
    revenue: Number(r.revenue || 0),
    total_revenue: Number(r.total_revenue || r.revenue || 0),
  }));

  const topRentals = topRentalsRes.rows.map(r => ({
    ...r,
    times_rented: Number(r.times_rented || 0),
    rental_revenue: Number(r.rental_revenue || 0),
    total_revenue: Number(r.total_revenue || r.rental_revenue || 0),
  }));

  return {
    top_sales: topSales,
    top_rentals: topRentals,
    products: topSales,
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

  let branchQuery = 'SELECT id, name FROM branches';
  const bParams = [];
  if (reportBranchId) {
    branchQuery += ' WHERE id = $1';
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
         WHERE branch_id = ANY($1::int[]) AND status <> 'cancelled' AND order_date >= $2::date AND order_date < $3::date
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
         WHERE o.branch_id = ANY($1::int[]) AND o.status <> 'cancelled' AND o.order_date >= $2::date AND o.order_date < $3::date
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
        `SELECT branch_id,
                COALESCE(SUM(amount), 0) as total,
                COALESCE(SUM(CASE WHEN COALESCE(payment_method, 'cash') = 'cash' THEN amount ELSE 0 END), 0) as cash_total
         FROM expenses
         WHERE branch_id = ANY($1::int[]) AND category <> 'bonus' AND expense_date >= $2::date AND expense_date < $3::date AND is_deleted IS NOT TRUE
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
         WHERE branch_id = ANY($1::int[]) AND status <> 'cancelled' AND booking_date >= $2::date AND booking_date < $3::date
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
           SELECT branch_id, paid_amount as total
           FROM orders
           WHERE branch_id = ANY($1::int[])
             AND status <> 'cancelled'
             AND order_date >= $2::date
             AND order_date < $3::date
             AND ${normalizedPaymentMethodSql('payment_method')} = 'cash'
           UNION ALL
           SELECT branch_id, deposit as total
           FROM rentals
           WHERE branch_id = ANY($1::int[])
             AND status <> 'cancelled'
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
    const cashExpensesByBranch = rowsByBranch(expensesRes.rows, row => Number(row.cash_total));
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
      const cash_expenses = cashExpensesByBranch.get(branchId) || 0;
      const total_salaries_paid = salariesByBranch.get(branchId) || 0;
      const total_rentals = rentals.total + (finesByBranch.get(branchId) || 0);
      const total_tailoring = tailoring.total;
      const total_revenue = total_sales + total_rentals + total_tailoring;
      const cash_drawer = (cashByBranch.get(branchId) || 0) - returns.total - cash_expenses;
      const gross_profit = total_revenue - cogs;
      const net_profit = total_revenue - (cogs + expenses + total_salaries_paid);

      return {
        branch_id: branch.id,
        branch_name: branch.name,
        total_sales,
        sales: total_sales,
        order_count: sales.count,
        return_count: returns.count,
        cogs,
        gross_profit,
        expenses,
        total_expenses: expenses,
        total_salaries_paid,
        salaries: total_salaries_paid,
        total_rentals,
        rentals: total_rentals,
        total_tailoring,
        tailoring: total_tailoring,
        tailoring_count: tailoring.count,
        total_revenue,
        revenue: total_revenue,
        cash_drawer,
        cash_in_drawer: cash_drawer,
        net_cash: cash_drawer,
        rental_count: rentals.count,
        net_profit,
        profit: net_profit,
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
       WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date ${pFilter}
       UNION ALL
       SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, total_price as total
       FROM rentals
       WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date ${pFilter}
       UNION ALL
       SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method, fine_amount as total
       FROM rentals
       WHERE status = 'returned' AND actual_return_date >= $1::date AND actual_return_date < $2::date ${pFilter}
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
         WHERE o.status <> 'cancelled' AND o.order_date >= $1::date AND o.order_date < $2::date ${branchFilterSales}
       ),
       allocated AS (
         SELECT lines.*, SUM(line_net) OVER (PARTITION BY order_id) as order_net
         FROM lines
       )
       SELECT name, barcode, category, color, size, branch_name,
              SUM(quantity)::int as total_sold,
              SUM(quantity)::int as quantity_sold,
              ROUND(SUM(GREATEST(
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
              )), 2) as revenue,
              ROUND(SUM(GREATEST(
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
              )), 2) as total_revenue
       FROM allocated
       GROUP BY inventory_id, name, barcode, category, color, size, branch_name
       ORDER BY total_sold DESC
       LIMIT 5`,
      topParams
    ),
    db.query(
      `SELECT i.name, i.barcode, i.category, i.color, i.size_cut as size, b.name as branch_name, COUNT(r.id)::int as times_rented, ROUND(SUM(r.total_price), 2) as rental_revenue
       FROM rentals r
       JOIN rental_inventory i ON r.rental_inventory_id = i.id
       LEFT JOIN branches b ON r.branch_id = b.id
       WHERE r.status <> 'cancelled' AND r.booking_date >= $1::date AND r.booking_date < $2::date ${branchFilterRentals}
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
      `SELECT COALESCE(o.branch_invoice_number, o.id) as invoice_number, o.total_amount as amount, o.paid_amount, GREATEST(o.total_amount - o.paid_amount, 0) as remainder, e.name as cashier_name, o.payment_method, TO_CHAR(o.order_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'sales' as invoice_type
       FROM orders o
       LEFT JOIN employees e ON o.seller_id = e.id
       WHERE o.branch_id = ANY($1::int[]) AND o.status <> 'cancelled' AND o.order_date >= $2::date AND o.order_date < $3::date
       ORDER BY o.order_date DESC LIMIT 500`,
      expenseReportParams
    ),
    db.query(
      `SELECT r.id as invoice_number, r.total_price as amount, r.deposit as paid_amount, r.remaining as remainder, r.status, e.name as cashier_name, r.payment_method, TO_CHAR(r.booking_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'rental' as invoice_type
       FROM rentals r
       LEFT JOIN employees e ON r.seller_id = e.id
       WHERE r.branch_id = ANY($1::int[]) AND r.status <> 'cancelled' AND r.booking_date >= $2::date AND r.booking_date < $3::date
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

async function getSummaryReport(query = {}, user = null) {
  const profitData = await getProfitReport(query, user);
  const summary = profitData.summary || {};
  return {
    month: profitData.month,
    date_from: profitData.date_from,
    date_to: profitData.date_to,
    revenue: summary.revenue || summary.total_revenue || 0,
    total_revenue: summary.total_revenue || 0,
    sales: summary.sales || summary.total_sales || 0,
    rentals: summary.rentals || summary.total_rentals || 0,
    tailoring: summary.tailoring || summary.total_tailoring || 0,
    cogs: summary.cogs || 0,
    gross_profit: summary.gross_profit || 0,
    expenses: summary.expenses || 0,
    salaries: summary.salaries || summary.total_salaries_paid || 0,
    net_profit: summary.net_profit || 0,
    profit_margin: summary.profit_margin || 0,
    cash_drawer: summary.cash_drawer || 0,
    branch_reports: profitData.branch_reports || [],
  };
}

async function getSalesReport(query = {}, user = null) {
  const range = parseReportDateRange(query);
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const limit = Number(query.limit) > 0 ? Number(query.limit) : 50000;
  const params = [range.start, range.end];
  let branchFilter = '';
  if (reportBranchId) {
    params.push(reportBranchId);
    branchFilter = `AND o.branch_id = $${params.length}`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const [ordersRes, summaryRes] = await Promise.all([
    db.query(`
      SELECT o.id, COALESCE(o.branch_invoice_number, o.id) as invoice_number,
             o.order_date, TO_CHAR(o.order_date, 'YYYY-MM-DD HH12:MI AM') as created_at_formatted,
             o.total_amount, o.paid_amount,
             GREATEST(o.total_amount - o.paid_amount, 0) as remainder,
             o.payment_method, o.invoice_discount, o.status,
             c.name as customer_name, c.phone as customer_phone,
             b.name as branch_name, e.name as cashier_name,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id)::int as items_count
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN branches b ON o.branch_id = b.id
      LEFT JOIN employees e ON o.seller_id = e.id
      WHERE o.status <> 'cancelled' AND o.order_date >= $1::date AND o.order_date < $2::date ${branchFilter}
      ORDER BY o.order_date DESC
      LIMIT ${limitParam}
    `, params),
    db.query(`
      SELECT COUNT(*)::int as count,
             COALESCE(SUM(total_amount), 0) as total_amount,
             COALESCE(SUM(paid_amount), 0) as total_paid,
             COALESCE(SUM(CASE WHEN ${normalizedPaymentMethodSql('payment_method')} = 'cash' THEN paid_amount ELSE 0 END), 0) as cash_paid,
             COALESCE(SUM(CASE WHEN ${normalizedPaymentMethodSql('payment_method')} = 'visa' THEN paid_amount ELSE 0 END), 0) as visa_paid
      FROM orders o
      WHERE o.status <> 'cancelled' AND o.order_date >= $1::date AND o.order_date < $2::date ${branchFilter}
    `, params.slice(0, reportBranchId ? 3 : 2))
  ]);

  if (ordersRes.rows.length > 0) {
    const orderIds = ordersRes.rows.map((o) => o.id);

    const [itemsRes, returnsRes] = await Promise.all([
      db.query(`
        SELECT oi.order_id, oi.inventory_id, oi.quantity, oi.price_at_time, oi.size,
               COALESCE(i.name, 'صنف غير محدد') as product_name, i.barcode, i.category
        FROM order_items oi
        LEFT JOIN inventory i ON oi.inventory_id = i.id
        WHERE oi.order_id = ANY($1::int[])
        ORDER BY oi.id ASC
      `, [orderIds]),
      db.query(`
        SELECT order_id, COALESCE(SUM(total_return_amount), 0)::numeric as total_returned
        FROM returns
        WHERE order_id = ANY($1::int[])
        GROUP BY order_id
      `, [orderIds])
    ]);

    const itemsByOrderId = new Map();
    for (const it of itemsRes.rows) {
      if (!itemsByOrderId.has(it.order_id)) {
        itemsByOrderId.set(it.order_id, []);
      }
      itemsByOrderId.get(it.order_id).push(it);
    }

    const returnsByOrderId = new Map();
    for (const ret of returnsRes.rows) {
      returnsByOrderId.set(ret.order_id, Number(ret.total_returned || 0));
    }

    for (const o of ordersRes.rows) {
      const items = itemsByOrderId.get(o.id) || [];
      o.items = items;
      o.product_names = items.map((it) => `${it.product_name}${Number(it.quantity) > 1 ? ` (×${it.quantity})` : ''}`).join('، ') || '-';

      const returnedAmount = Number(returnsByOrderId.get(o.id) || 0);
      o.returned_amount = returnedAmount;

      const totalAmt = Number(o.total_amount || 0);
      const paidAmt = Number(o.paid_amount || 0);
      const netTotal = Math.max(0, totalAmt - returnedAmount);
      const netPaid = Math.max(0, paidAmt - returnedAmount);
      o.net_total = netTotal;
      o.net_paid = netPaid;

      // Calculate remainder accurately
      if (o.status === 'returned') {
        o.remainder = 0;
      } else if (o.status === 'partially_returned') {
        if (paidAmt < netTotal) {
          o.remainder = Math.max(0, netTotal - paidAmt);
        } else {
          o.remainder = netTotal;
        }
      } else {
        o.remainder = Math.max(0, totalAmt - paidAmt);
      }
    }
  }

  return {
    date_from: range.dateFrom,
    date_to: range.dateTo,
    summary: {
      total_orders: summaryRes.rows[0]?.count || 0,
      total_amount: Number(summaryRes.rows[0]?.total_amount || 0),
      total_paid: Number(summaryRes.rows[0]?.total_paid || 0),
      cash_paid: Number(summaryRes.rows[0]?.cash_paid || 0),
      visa_paid: Number(summaryRes.rows[0]?.visa_paid || 0),
    },
    orders: ordersRes.rows,
  };
}

async function getRentalsReport(query = {}, user = null) {
  const range = parseReportDateRange(query);
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const limit = Number(query.limit) > 0 ? Number(query.limit) : 50000;
  const params = [range.start, range.end];
  let branchFilter = '';
  if (reportBranchId) {
    params.push(reportBranchId);
    branchFilter = `AND r.branch_id = $${params.length}`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const [rentalsRes, summaryRes] = await Promise.all([
    db.query(`
      SELECT r.id, r.total_price, r.deposit, r.remaining, r.fine_amount,
             r.status, r.booking_date, r.pickup_date, r.pickup_date as delivery_date, r.return_date, r.actual_return_date,
             TO_CHAR(r.booking_date, 'YYYY-MM-DD HH12:MI AM') as booking_date_formatted,
             r.payment_method,
             c.name as customer_name, c.phone as customer_phone,
             b.name as branch_name, ri.name as item_name
      FROM rentals r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN branches b ON r.branch_id = b.id
      LEFT JOIN rental_inventory ri ON r.rental_inventory_id = ri.id
      WHERE r.status <> 'cancelled' AND r.booking_date >= $1::date AND r.booking_date < $2::date ${branchFilter}
      ORDER BY r.booking_date DESC
      LIMIT ${limitParam}
    `, params),
    db.query(`
      SELECT COUNT(*)::int as count,
             COALESCE(SUM(total_price), 0) as total_price,
             COALESCE(SUM(deposit), 0) as total_deposit,
             COALESCE(SUM(remaining), 0) as total_remaining,
             COALESCE(SUM(fine_amount), 0) as total_fines,
             COUNT(CASE WHEN status = 'rented' THEN 1 END)::int as active_count,
             COUNT(CASE WHEN status = 'returned' THEN 1 END)::int as returned_count,
             COUNT(CASE WHEN status = 'late' THEN 1 END)::int as late_count
      FROM rentals r
      WHERE r.status <> 'cancelled' AND r.booking_date >= $1::date AND r.booking_date < $2::date ${branchFilter}
    `, params.slice(0, reportBranchId ? 3 : 2))
  ]);

  return {
    date_from: range.dateFrom,
    date_to: range.dateTo,
    summary: {
      total_rentals: summaryRes.rows[0]?.count || 0,
      total_price: Number(summaryRes.rows[0]?.total_price || 0),
      total_deposit: Number(summaryRes.rows[0]?.total_deposit || 0),
      total_remaining: Number(summaryRes.rows[0]?.total_remaining || 0),
      total_fines: Number(summaryRes.rows[0]?.total_fines || 0),
      active_count: summaryRes.rows[0]?.active_count || 0,
      returned_count: summaryRes.rows[0]?.returned_count || 0,
      late_count: summaryRes.rows[0]?.late_count || 0,
    },
    rentals: rentalsRes.rows,
  };
}

async function getExpensesReport(query = {}, user = null) {
  const range = parseReportDateRange(query);
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const limit = Number(query.limit) > 0 ? Number(query.limit) : 50000;
  const params = [range.start, range.end];
  let branchFilter = '';
  if (reportBranchId) {
    params.push(reportBranchId);
    branchFilter = `AND e.branch_id = $${params.length}`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;

  const [expensesRes, summaryRes, categoryRes] = await Promise.all([
    db.query(`
      SELECT e.id, TO_CHAR(e.expense_date, 'YYYY-MM-DD') as expense_date,
             COALESCE(NULLIF(e.category, ''), 'غير محدد') as category,
             COALESCE(e.amount, 0) as amount,
             COALESCE(e.notes, '') as notes,
             b.name as branch_name
      FROM expenses e
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.category <> 'bonus' AND e.expense_date >= $1::date AND e.expense_date < $2::date AND e.is_deleted IS NOT TRUE ${branchFilter}
      ORDER BY e.expense_date DESC, e.id DESC
      LIMIT ${limitParam}
    `, params),
    db.query(`
      SELECT COUNT(*)::int as count,
             COALESCE(SUM(amount), 0) as total_amount
      FROM expenses e
      WHERE e.category <> 'bonus' AND e.expense_date >= $1::date AND e.expense_date < $2::date AND e.is_deleted IS NOT TRUE ${branchFilter}
    `, params.slice(0, reportBranchId ? 3 : 2)),
    db.query(`
      SELECT COALESCE(NULLIF(e.category, ''), 'غير محدد') as category,
             COUNT(*)::int as count,
             COALESCE(SUM(amount), 0) as total_amount
      FROM expenses e
      WHERE e.category <> 'bonus' AND e.expense_date >= $1::date AND e.expense_date < $2::date AND e.is_deleted IS NOT TRUE ${branchFilter}
      GROUP BY 1
      ORDER BY total_amount DESC
    `, params.slice(0, reportBranchId ? 3 : 2)),
  ]);

  return {
    date_from: range.dateFrom,
    date_to: range.dateTo,
    summary: {
      total_count: summaryRes.rows[0]?.count || 0,
      total_amount: Number(summaryRes.rows[0]?.total_amount || 0),
    },
    categories: categoryRes.rows.map(r => ({
      category: r.category,
      count: r.count,
      total_amount: Number(r.total_amount),
    })),
    expenses: expensesRes.rows,
  };
}

async function getInventoryReport(query = {}, user = null) {
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const params = [];
  let branchFilter = '';
  if (reportBranchId) {
    params.push(reportBranchId);
    branchFilter = 'AND ib.branch_id = $1';
  }

  const canSeeProfit = canViewReportProfit(user);

  const [itemsRes, summaryRes] = await Promise.all([
    db.query(`
      SELECT i.id, i.name, i.barcode, i.category, i.color, i.size_cut,
             COALESCE(SUM(ib.stock_level), 0)::int as stock_level,
             COALESCE(i.min_stock_level, 5)::int as min_stock_level,
             COALESCE(i.price, 0) as price,
             ${canSeeProfit ? 'COALESCE(i.cost_price, 0)' : '0'} as cost_price,
             (COALESCE(SUM(ib.stock_level), 0) * COALESCE(i.price, 0)) as total_retail_value,
             ${canSeeProfit ? '(COALESCE(SUM(ib.stock_level), 0) * COALESCE(i.cost_price, 0))' : '0'} as total_cost_value,
             CASE WHEN COALESCE(SUM(ib.stock_level), 0) <= COALESCE(i.min_stock_level, 5) THEN true ELSE false END as is_low_stock
      FROM inventory i
      LEFT JOIN inventory_branches ib ON i.id = ib.inventory_id
      WHERE i.is_deleted = false ${branchFilter}
      GROUP BY i.id, i.name, i.barcode, i.category, i.color, i.size_cut, i.min_stock_level, i.price, i.cost_price
      ORDER BY i.name ASC
    `, params),
    db.query(`
      SELECT COUNT(DISTINCT i.id)::int as total_items,
             COALESCE(SUM(ib.stock_level), 0)::int as total_quantity,
             COALESCE(SUM(ib.stock_level * COALESCE(i.price, 0)), 0) as total_retail_value,
             ${canSeeProfit ? 'COALESCE(SUM(ib.stock_level * COALESCE(i.cost_price, 0)), 0)' : '0'} as total_cost_value,
             COUNT(DISTINCT CASE WHEN ib.stock_level <= COALESCE(i.min_stock_level, 5) THEN i.id END)::int as low_stock_count
      FROM inventory i
      LEFT JOIN inventory_branches ib ON i.id = ib.inventory_id
      WHERE i.is_deleted = false ${branchFilter}
    `, params),
  ]);

  return {
    branch_id: reportBranchId,
    summary: {
      total_items: summaryRes.rows[0]?.total_items || 0,
      total_quantity: summaryRes.rows[0]?.total_quantity || 0,
      total_retail_value: Number(summaryRes.rows[0]?.total_retail_value || 0),
      total_cost_value: canSeeProfit ? Number(summaryRes.rows[0]?.total_cost_value || 0) : null,
      low_stock_count: summaryRes.rows[0]?.low_stock_count || 0,
    },
    items: itemsRes.rows.map(item => ({
      ...item,
      stock_level: Number(item.stock_level),
      price: Number(item.price),
      cost_price: canSeeProfit ? Number(item.cost_price) : null,
      total_retail_value: Number(item.total_retail_value),
      total_cost_value: canSeeProfit ? Number(item.total_cost_value) : null,
    })),
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
  getSummaryReport,
  getSalesReport,
  getRentalsReport,
  getExpensesReport,
  getInventoryReport,
};
