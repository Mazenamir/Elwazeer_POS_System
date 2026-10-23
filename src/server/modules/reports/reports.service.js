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
const { resolveCategoryQuery } = require('../inventory/inventory.helpers');

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
    advancesRes,
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
         SELECT branch_id,
                CASE
                  WHEN COALESCE(cash_amount, 0) > 0 THEN cash_amount
                  WHEN ${normalizedPaymentMethodSql('payment_method')} = 'cash' THEN GREATEST(0, paid_amount - COALESCE(change_amount, 0))
                  ELSE 0
                END as total
         FROM orders
         WHERE branch_id = ANY($1::int[])
           AND status <> 'cancelled'
           AND order_date >= $2::date
           AND order_date < $3::date
           AND (
             COALESCE(cash_amount, 0) > 0
             OR ${normalizedPaymentMethodSql('payment_method')} = 'cash'
           )
         UNION ALL
         SELECT branch_id,
                CASE
                  WHEN ${normalizedPaymentMethodSql('payment_method')} = 'split' THEN COALESCE(cash_amount, 0)
                  WHEN ${normalizedPaymentMethodSql('payment_method')} = 'cash' THEN COALESCE(NULLIF(paid_amount, 0), deposit, 0)
                  ELSE 0
                END as total
         FROM rentals
         WHERE branch_id = ANY($1::int[])
           AND status <> 'cancelled'
           AND booking_date >= $2::date
           AND booking_date < $3::date
           AND (
             COALESCE(cash_amount, 0) > 0
             OR ${normalizedPaymentMethodSql('payment_method')} = 'cash'
           )
         UNION ALL
         SELECT branch_id, fine_amount as total
         FROM rentals
         WHERE branch_id = ANY($1::int[])
           AND actual_return_date >= $2::date
           AND actual_return_date < $3::date
           AND status = 'returned'
           AND (
             ${normalizedPaymentMethodSql('payment_method')} = 'cash'
             OR ${normalizedPaymentMethodSql('payment_method')} = 'split'
           )
           AND COALESCE(fine_amount, 0) > 0
         UNION ALL
         SELECT p.branch_id, p.amount as total
         FROM tailoring_payments p
         JOIN tailoring_orders t ON p.tailoring_order_id = t.id
         WHERE p.branch_id = ANY($1::int[])
           AND p.payment_date >= $2::date
           AND p.payment_date < $3::date
           AND ${normalizedPaymentMethodSql('COALESCE(p.payment_method, t.payment_method)')} = 'cash'
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
    db.query(
      `SELECT e.branch_id, COALESCE(SUM(et.amount), 0) as total
       FROM employee_transactions et
       JOIN employees e ON e.id = et.employee_id
       WHERE e.branch_id = ANY($1::int[])
         AND et.type = 'advance'
         AND et.transaction_date >= $2::date
         AND et.transaction_date < $3::date
       GROUP BY e.branch_id`,
      reportParams
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
  const advancesByBranch = rowsByBranch(advancesRes.rows, row => Number(row.total));

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
    const advances = advancesByBranch.get(branchId) || 0;
    const physical_cash_in_drawer = Math.max(0, cash_drawer - advances);
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
      physical_cash_in_drawer,
      net_cash: cash_drawer,
      cogs,
      gross_profit,
      expenses,
      total_salaries_paid,
      salaries: total_salaries_paid,
      advances,
      total_advances: advances,
      total_expenses_and_advances: expenses + advances,
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
    acc.total_advances += (curr.advances || 0);
    acc.total_inventory_value += curr.total_inventory_value;
    return acc;
  }, { total_sales: 0, total_rentals: 0, total_tailoring: 0, total_revenue: 0, cash_drawer: 0, total_advances: 0, cogs: 0, expenses: 0, total_salaries_paid: 0, net_profit: 0, total_inventory_value: 0 });

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
  summary.physical_cash_in_drawer = Math.max(0, summary.cash_drawer - summary.total_advances);
  summary.total_expenses_and_advances = summary.expenses + summary.total_advances;
  summary.total_sales_and_revenue = summary.total_revenue;
  summary.net_cash = summary.cash_drawer;
  summary.net_cash = summary.cash_drawer;

  const paymentParams = reportBranchId ? [range.start, range.end, reportBranchId] : [range.start, range.end];
  const paymentBranchFilter = reportBranchId ? ' AND branch_id = $3' : '';

  const [paymentRes, expenseItemsRes, salaryItemsRes, tailoringItemsRes] = await Promise.all([
    db.query(
      `SELECT payment_method, SUM(total) as total
       FROM (
         SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method,
                CASE
                  WHEN ${normalizedPaymentMethodSql('payment_method')} = 'cash' THEN
                    COALESCE(NULLIF(cash_amount, 0), GREATEST(0, paid_amount - COALESCE(change_amount, 0)))
                  ELSE paid_amount
                END as total
         FROM orders
         WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} <> 'split'
           AND paid_amount > 0
         UNION ALL
         SELECT 'cash' as payment_method,
                cash_amount as total
         FROM orders
         WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(cash_amount, 0) > 0
         UNION ALL
         SELECT 'visa' as payment_method, card_amount as total
         FROM orders
         WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(card_amount, 0) > 0
         UNION ALL
         SELECT 'bank_transfer' as payment_method, bank_transfer_amount as total
         FROM orders
         WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(bank_transfer_amount, 0) > 0
         UNION ALL
         SELECT 'wallet' as payment_method, wallet_amount as total
         FROM orders
         WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(wallet_amount, 0) > 0
         UNION ALL
         SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method,
                COALESCE(NULLIF(paid_amount, 0), deposit, 0) as total
         FROM rentals
         WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} <> 'split'
           AND COALESCE(NULLIF(paid_amount, 0), deposit, 0) > 0
         UNION ALL
         SELECT 'cash' as payment_method, cash_amount as total
         FROM rentals
         WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(cash_amount, 0) > 0
         UNION ALL
         SELECT 'visa' as payment_method, card_amount as total
         FROM rentals
         WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(card_amount, 0) > 0
         UNION ALL
         SELECT 'bank_transfer' as payment_method, bank_transfer_amount as total
         FROM rentals
         WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(bank_transfer_amount, 0) > 0
         UNION ALL
         SELECT 'wallet' as payment_method, wallet_amount as total
         FROM rentals
         WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date${paymentBranchFilter}
           AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(wallet_amount, 0) > 0
         UNION ALL
         SELECT CASE
                  WHEN ${normalizedPaymentMethodSql('payment_method')} = 'split' THEN 'cash'
                  ELSE ${normalizedPaymentMethodSql('payment_method')}
                END as payment_method,
                fine_amount as total
         FROM rentals
         WHERE status = 'returned' AND actual_return_date >= $1::date AND actual_return_date < $2::date${paymentBranchFilter}
           AND COALESCE(fine_amount, 0) > 0
         UNION ALL
         SELECT ${normalizedPaymentMethodSql('COALESCE(p.payment_method, t.payment_method)')} as payment_method, p.amount as total
         FROM tailoring_payments p
         JOIN tailoring_orders t ON p.tailoring_order_id = t.id
         WHERE p.payment_date >= $1::date AND p.payment_date < $2::date${paymentBranchFilter.replace('branch_id', 'p.branch_id')}
           AND COALESCE(p.amount, 0) > 0
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
              COALESCE(b.name, '-') as branch_name,
              COALESCE(e.payment_method, 'cash') as payment_method
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
              p.is_remainder,
              COALESCE(p.payment_method, t.payment_method, 'cash') as payment_method
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
      `SELECT COALESCE(o.branch_invoice_number, o.id) as invoice_number, o.total_amount as amount, o.paid_amount, GREATEST(o.total_amount - o.paid_amount, 0) as remainder, e.name as cashier_name, o.payment_method,
              o.cash_amount, o.card_amount, o.wallet_amount, o.bank_transfer_amount, o.payment_splits,
              TO_CHAR(o.order_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'sales' as invoice_type
       FROM orders o
       LEFT JOIN employees e ON o.seller_id = e.id
       WHERE o.branch_id = ANY($1::int[]) AND o.status <> 'cancelled' AND o.order_date >= $2::date AND o.order_date < $3::date
       ORDER BY o.order_date DESC LIMIT 1500`,
      reportParams
    ),
    db.query(
      `SELECT r.id as invoice_number, r.total_price as amount, r.deposit as paid_amount, r.remaining as remainder, r.status, e.name as cashier_name, r.payment_method,
              r.cash_amount, r.card_amount, r.wallet_amount, r.bank_transfer_amount, r.payment_splits,
              TO_CHAR(r.booking_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'rental' as invoice_type
       FROM rentals r
       LEFT JOIN employees e ON r.seller_id = e.id
       WHERE r.branch_id = ANY($1::int[]) AND r.status <> 'cancelled' AND r.booking_date >= $2::date AND r.booking_date < $3::date
       ORDER BY r.booking_date DESC LIMIT 1500`,
      reportParams
    ),
  ]);

  const electronicCollections = (paymentRes.rows || [])
    .filter(r => ['visa', 'bank_transfer', 'wallet'].includes(r.payment_method))
    .reduce((sum, r) => sum + Number(r.total || 0), 0);
  summary.electronic_collections = electronicCollections;

  const cairoNow = await getDatabaseCairoNow(db);
  const todayStart = cairoNow.date;
  const todayEnd = addDays(todayStart, 1);
  const mStart = `${cairoNow.month}-01`;
  const mEnd = addDays(`${cairoNow.month}-${new Date(parseInt(cairoNow.month.slice(0, 4), 10), parseInt(cairoNow.month.slice(5, 7), 10), 0).getDate()}`, 1);

  const [tOrders, tExpenses, tSalaries, mOrders, mExpenses, mSalaries] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(total_amount), 0) as rev, COALESCE(SUM(total_cost_price), 0) as cogs FROM orders WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date ${reportBranchId ? 'AND branch_id = $3' : ''}`, [todayStart, todayEnd, ...(reportBranchId ? [reportBranchId] : [])]).catch(() => ({ rows: [{ rev: 0, cogs: 0 }] })),
    db.query(`SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE is_deleted IS NOT TRUE AND category <> 'bonus' AND expense_date >= $1::date AND expense_date < $2::date ${reportBranchId ? 'AND branch_id = $3' : ''}`, [todayStart, todayEnd, ...(reportBranchId ? [reportBranchId] : [])]).catch(() => ({ rows: [{ t: 0 }] })),
    db.query(`SELECT COALESCE(SUM(amount), 0) as t FROM employee_transactions et JOIN employees e ON e.id = et.employee_id WHERE et.type IN ('salary_payment', 'advance') AND et.transaction_date >= $1::date AND et.transaction_date < $2::date ${reportBranchId ? 'AND e.branch_id = $3' : ''}`, [todayStart, todayEnd, ...(reportBranchId ? [reportBranchId] : [])]).catch(() => ({ rows: [{ t: 0 }] })),
    db.query(`SELECT COALESCE(SUM(total_amount), 0) as rev, COALESCE(SUM(total_cost_price), 0) as cogs FROM orders WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date ${reportBranchId ? 'AND branch_id = $3' : ''}`, [mStart, mEnd, ...(reportBranchId ? [reportBranchId] : [])]).catch(() => ({ rows: [{ rev: 0, cogs: 0 }] })),
    db.query(`SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE is_deleted IS NOT TRUE AND category <> 'bonus' AND expense_date >= $1::date AND expense_date < $2::date ${reportBranchId ? 'AND branch_id = $3' : ''}`, [mStart, mEnd, ...(reportBranchId ? [reportBranchId] : [])]).catch(() => ({ rows: [{ t: 0 }] })),
    db.query(`SELECT COALESCE(SUM(amount), 0) as t FROM employee_transactions et JOIN employees e ON e.id = et.employee_id WHERE et.type IN ('salary_payment', 'advance') AND et.transaction_date >= $1::date AND et.transaction_date < $2::date ${reportBranchId ? 'AND e.branch_id = $3' : ''}`, [mStart, mEnd, ...(reportBranchId ? [reportBranchId] : [])]).catch(() => ({ rows: [{ t: 0 }] })),
  ]);

  const todayRev = Number(tOrders.rows[0]?.rev || 0);
  const todayCogs = Number(tOrders.rows[0]?.cogs || 0);
  const todayExp = Number(tExpenses.rows[0]?.t || 0);
  const todaySal = Number(tSalaries.rows[0]?.t || 0);

  const monthRev = Number(mOrders.rows[0]?.rev || 0);
  const monthCogs = Number(mOrders.rows[0]?.cogs || 0);
  const monthExp = Number(mExpenses.rows[0]?.t || 0);
  const monthSal = Number(mSalaries.rows[0]?.t || 0);

  summary.today_revenue = todayRev;
  summary.today_cogs = todayCogs;
  summary.today_expenses = todayExp;
  summary.today_profit = todayRev - todayCogs - todayExp - todaySal;
  summary.month_revenue = monthRev;
  summary.month_cogs = monthCogs;
  summary.month_expenses = monthExp;
  summary.month_profit = monthRev - monthCogs - monthExp - monthSal;

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
    cogs: canViewProfit ? summary.cogs : undefined,
    gross_profit: canViewProfit ? gross_profit : undefined,
    expenses: summary.expenses,
    salaries: summary.total_salaries_paid,
    total_salaries_paid: summary.total_salaries_paid,
    cash_drawer: summary.cash_drawer,
    cash_in_drawer: summary.cash_drawer,
    physical_cash_in_drawer: summary.physical_cash_in_drawer,
    electronic_collections: summary.electronic_collections,
    total_advances: summary.total_advances,
    total_expenses_and_advances: summary.total_expenses_and_advances,
    today_profit: canViewProfit ? summary.today_profit : undefined,
    month_profit: canViewProfit ? summary.month_profit : undefined,
    today_revenue: summary.today_revenue,
    month_revenue: summary.month_revenue,
    net_cash: summary.cash_drawer,
    net_profit: canViewProfit ? net_profit : undefined,
    profit: canViewProfit ? net_profit : undefined,
    profit_margin: canViewProfit ? profit_margin : undefined,
    branch_reports: canViewProfit ? report : report.map(stripReportProfit),
    branch_sales: canViewProfit ? report : report.map(stripReportProfit),
    summary: canViewProfit ? summary : stripReportProfit(summary),
    payments: paymentRes.rows,
    payment_methods: paymentRes.rows.map(r => ({
      method: r.payment_method,
      total_amount: Number(r.total || 0),
      total: Number(r.total || 0),
    })),
    expenses_details: expenseDetails,
    salaries_details: salaryDetails,
    tailoring_details: tailoringDetails,
    tailoring: tailoringDetails,
    attendance: attendanceRes.rows,
    sales_invoices: (salesInvoicesRes.rows || []).map((inv) => {
      let splits = typeof inv.payment_splits === 'string' ? (() => { try { return JSON.parse(inv.payment_splits); } catch { return null; } })() : inv.payment_splits;
      if ((!splits || splits.length === 0) && inv.payment_method === 'split') {
        splits = [];
        if (Number(inv.cash_amount) > 0) splits.push({ method: 'cash', amount: Number(inv.cash_amount) });
        if (Number(inv.card_amount) > 0) splits.push({ method: 'card', amount: Number(inv.card_amount) });
        if (Number(inv.bank_transfer_amount) > 0) splits.push({ method: 'bank_transfer', amount: Number(inv.bank_transfer_amount) });
        if (Number(inv.wallet_amount) > 0) splits.push({ method: 'wallet', amount: Number(inv.wallet_amount) });
      }
      return {
        ...inv,
        payment_splits: splits,
      };
    }),
    rental_invoices: (rentalInvoicesRes.rows || []).map((inv) => {
      let splits = typeof inv.payment_splits === 'string' ? (() => { try { return JSON.parse(inv.payment_splits); } catch { return null; } })() : inv.payment_splits;
      if ((!splits || splits.length === 0) && inv.payment_method === 'split') {
        splits = [];
        if (Number(inv.cash_amount) > 0) splits.push({ method: 'cash', amount: Number(inv.cash_amount) });
        if (Number(inv.card_amount) > 0) splits.push({ method: 'card', amount: Number(inv.card_amount) });
        if (Number(inv.bank_transfer_amount) > 0) splits.push({ method: 'bank_transfer', amount: Number(inv.bank_transfer_amount) });
        if (Number(inv.wallet_amount) > 0) splits.push({ method: 'wallet', amount: Number(inv.wallet_amount) });
      }
      return {
        ...inv,
        payment_splits: splits,
      };
    }),
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
           SELECT branch_id,
                  CASE
                    WHEN COALESCE(cash_amount, 0) > 0 THEN cash_amount
                    WHEN ${normalizedPaymentMethodSql('payment_method')} = 'cash' THEN GREATEST(0, paid_amount - COALESCE(change_amount, 0))
                    ELSE 0
                  END as total
           FROM orders
           WHERE branch_id = ANY($1::int[])
             AND status <> 'cancelled'
             AND order_date >= $2::date
             AND order_date < $3::date
             AND (
               COALESCE(cash_amount, 0) > 0
               OR ${normalizedPaymentMethodSql('payment_method')} = 'cash'
             )
           UNION ALL
           SELECT branch_id,
                  CASE
                    WHEN ${normalizedPaymentMethodSql('payment_method')} = 'split' THEN COALESCE(cash_amount, 0)
                    WHEN ${normalizedPaymentMethodSql('payment_method')} = 'cash' THEN COALESCE(NULLIF(paid_amount, 0), deposit, 0)
                    ELSE 0
                  END as total
           FROM rentals
           WHERE branch_id = ANY($1::int[])
             AND status <> 'cancelled'
             AND booking_date >= $2::date
             AND booking_date < $3::date
             AND (
               COALESCE(cash_amount, 0) > 0
               OR ${normalizedPaymentMethodSql('payment_method')} = 'cash'
             )
           UNION ALL
           SELECT branch_id, fine_amount as total
           FROM rentals
           WHERE branch_id = ANY($1::int[])
             AND actual_return_date >= $2::date
             AND actual_return_date < $3::date
             AND status = 'returned'
             AND (
               ${normalizedPaymentMethodSql('payment_method')} = 'cash'
               OR ${normalizedPaymentMethodSql('payment_method')} = 'split'
             )
             AND COALESCE(fine_amount, 0) > 0
           UNION ALL
           SELECT p.branch_id, p.amount as total
           FROM tailoring_payments p
           JOIN tailoring_orders t ON p.tailoring_order_id = t.id
           WHERE p.branch_id = ANY($1::int[])
             AND p.payment_date >= $2::date
             AND p.payment_date < $3::date
             AND ${normalizedPaymentMethodSql('COALESCE(p.payment_method, t.payment_method)')} = 'cash'
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
       SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method,
              CASE
                WHEN ${normalizedPaymentMethodSql('payment_method')} = 'cash' THEN
                  COALESCE(NULLIF(cash_amount, 0), GREATEST(0, paid_amount - COALESCE(change_amount, 0)))
                ELSE paid_amount
              END as total
       FROM orders
       WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} <> 'split'
         AND paid_amount > 0
       UNION ALL
       SELECT 'cash' as payment_method,
              cash_amount as total
       FROM orders
       WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(cash_amount, 0) > 0
       UNION ALL
       SELECT 'visa' as payment_method, card_amount as total
       FROM orders
       WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(card_amount, 0) > 0
       UNION ALL
       SELECT 'bank_transfer' as payment_method, bank_transfer_amount as total
       FROM orders
       WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(bank_transfer_amount, 0) > 0
       UNION ALL
       SELECT 'wallet' as payment_method, wallet_amount as total
       FROM orders
       WHERE status <> 'cancelled' AND order_date >= $1::date AND order_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(wallet_amount, 0) > 0
       UNION ALL
       SELECT ${normalizedPaymentMethodSql('payment_method')} as payment_method,
              COALESCE(NULLIF(paid_amount, 0), deposit, 0) as total
       FROM rentals
       WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} <> 'split'
         AND COALESCE(NULLIF(paid_amount, 0), deposit, 0) > 0
       UNION ALL
       SELECT 'cash' as payment_method, cash_amount as total
       FROM rentals
       WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(cash_amount, 0) > 0
       UNION ALL
       SELECT 'visa' as payment_method, card_amount as total
       FROM rentals
       WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(card_amount, 0) > 0
       UNION ALL
       SELECT 'bank_transfer' as payment_method, bank_transfer_amount as total
       FROM rentals
       WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(bank_transfer_amount, 0) > 0
       UNION ALL
       SELECT 'wallet' as payment_method, wallet_amount as total
       FROM rentals
       WHERE status <> 'cancelled' AND booking_date >= $1::date AND booking_date < $2::date ${pFilter}
         AND ${normalizedPaymentMethodSql('payment_method')} = 'split' AND COALESCE(wallet_amount, 0) > 0
       UNION ALL
       SELECT CASE
                WHEN ${normalizedPaymentMethodSql('payment_method')} = 'split' THEN 'cash'
                ELSE ${normalizedPaymentMethodSql('payment_method')}
              END as payment_method,
              fine_amount as total
       FROM rentals
       WHERE status = 'returned' AND actual_return_date >= $1::date AND actual_return_date < $2::date ${pFilter}
         AND COALESCE(fine_amount, 0) > 0
       UNION ALL
       SELECT ${normalizedPaymentMethodSql('COALESCE(p.payment_method, t.payment_method)')} as payment_method, p.amount as total
       FROM tailoring_payments p
       JOIN tailoring_orders t ON p.tailoring_order_id = t.id
       WHERE p.payment_date >= $1::date AND p.payment_date < $2::date ${pFilter.replace('branch_id', 'p.branch_id')}
         AND COALESCE(p.amount, 0) > 0
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
              COALESCE(b.name, '-') as branch_name,
              COALESCE(e.payment_method, 'cash') as payment_method
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
              p.is_remainder,
              COALESCE(p.payment_method, t.payment_method, 'cash') as payment_method
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
      `SELECT o.id, COALESCE(o.branch_invoice_number, o.id) as invoice_number, o.total_amount as amount, o.paid_amount,
              CASE WHEN o.status = 'returned' THEN 0 ELSE GREATEST(o.total_amount - o.paid_amount, 0) END as remainder,
              o.status, e.name as cashier_name, o.payment_method,
              o.cash_amount, o.card_amount, o.wallet_amount, o.bank_transfer_amount, o.payment_splits,
              TO_CHAR(o.order_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'sales' as invoice_type
       FROM orders o
       LEFT JOIN employees e ON o.seller_id = e.id
       WHERE o.branch_id = ANY($1::int[]) AND o.status <> 'cancelled' AND o.order_date >= $2::date AND o.order_date < $3::date
       ORDER BY o.order_date DESC LIMIT 500`,
      expenseReportParams
    ),
    db.query(
      `SELECT r.id as invoice_number, r.total_price as amount, r.deposit as paid_amount, r.remaining as remainder, r.status, e.name as cashier_name, r.payment_method,
              r.cash_amount, r.card_amount, r.wallet_amount, r.bank_transfer_amount, r.payment_splits,
              TO_CHAR(r.booking_date, 'YYYY-MM-DD HH12:MI AM') as created_date, 'rental' as invoice_type
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
    payment_methods: (paymentRes.rows || []).map(r => ({
      method: r.payment_method,
      total_amount: Number(r.total || 0),
      total: Number(r.total || 0),
    })),
    expenses: expenseDetails,
    expenses_details: expenseDetails,
    salaries: salaryDetails,
    salaries_details: salaryDetails,
    tailoring: tailoringDetails,
    tailoring_details: tailoringDetails,
    attendance: attendanceRes.rows,
    sales_invoices: (salesInvoicesRes.rows || []).map((inv) => {
      let splits = typeof inv.payment_splits === 'string' ? (() => { try { return JSON.parse(inv.payment_splits); } catch { return null; } })() : inv.payment_splits;
      if ((!splits || splits.length === 0) && inv.payment_method === 'split') {
        splits = [];
        if (Number(inv.cash_amount) > 0) splits.push({ method: 'cash', amount: Number(inv.cash_amount) });
        if (Number(inv.card_amount) > 0) splits.push({ method: 'card', amount: Number(inv.card_amount) });
        if (Number(inv.bank_transfer_amount) > 0) splits.push({ method: 'bank_transfer', amount: Number(inv.bank_transfer_amount) });
        if (Number(inv.wallet_amount) > 0) splits.push({ method: 'wallet', amount: Number(inv.wallet_amount) });
      }
      return {
        ...inv,
        payment_splits: splits,
      };
    }),
    rental_invoices: (rentalInvoicesRes.rows || []).map((inv) => {
      let splits = typeof inv.payment_splits === 'string' ? (() => { try { return JSON.parse(inv.payment_splits); } catch { return null; } })() : inv.payment_splits;
      if ((!splits || splits.length === 0) && inv.payment_method === 'split') {
        splits = [];
        if (Number(inv.cash_amount) > 0) splits.push({ method: 'cash', amount: Number(inv.cash_amount) });
        if (Number(inv.card_amount) > 0) splits.push({ method: 'card', amount: Number(inv.card_amount) });
        if (Number(inv.bank_transfer_amount) > 0) splits.push({ method: 'bank_transfer', amount: Number(inv.bank_transfer_amount) });
        if (Number(inv.wallet_amount) > 0) splits.push({ method: 'wallet', amount: Number(inv.wallet_amount) });
      }
      return {
        ...inv,
        payment_splits: splits,
      };
    }),
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
             o.cash_amount, o.card_amount, o.wallet_amount, o.bank_transfer_amount, o.payment_splits,
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
             COALESCE(SUM(CASE WHEN paid_amount > total_amount THEN total_amount ELSE paid_amount END), 0) as total_paid,
             COALESCE(SUM(CASE
               WHEN ${normalizedPaymentMethodSql('payment_method')} = 'split' THEN COALESCE(cash_amount, 0)
               WHEN COALESCE(cash_amount, 0) > 0 THEN cash_amount
               WHEN ${normalizedPaymentMethodSql('payment_method')} = 'cash' THEN GREATEST(0, paid_amount - COALESCE(change_amount, 0))
               ELSE 0
             END), 0) as cash_paid,
             COALESCE(SUM(CASE
               WHEN ${normalizedPaymentMethodSql('payment_method')} = 'split' THEN COALESCE(card_amount, 0)
               WHEN ${normalizedPaymentMethodSql('payment_method')} = 'visa' OR COALESCE(card_amount, 0) > 0 THEN COALESCE(NULLIF(card_amount, 0), paid_amount)
               ELSE 0
             END), 0) as visa_paid,
             COALESCE(SUM(CASE
               WHEN ${normalizedPaymentMethodSql('payment_method')} = 'split' THEN COALESCE(bank_transfer_amount, 0)
               WHEN ${normalizedPaymentMethodSql('payment_method')} = 'bank_transfer' OR COALESCE(bank_transfer_amount, 0) > 0 THEN COALESCE(NULLIF(bank_transfer_amount, 0), paid_amount)
               ELSE 0
             END), 0) as bank_transfer_paid,
             COALESCE(SUM(CASE
               WHEN ${normalizedPaymentMethodSql('payment_method')} = 'split' THEN COALESCE(wallet_amount, 0)
               WHEN ${normalizedPaymentMethodSql('payment_method')} = 'wallet' OR COALESCE(wallet_amount, 0) > 0 THEN COALESCE(NULLIF(wallet_amount, 0), paid_amount)
               ELSE 0
             END), 0) as wallet_paid
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
        o.remainder = Math.max(0, netTotal - netPaid);
      } else {
        o.remainder = Math.max(0, totalAmt - paidAmt);
      }

      let splits = Array.isArray(o.payment_splits)
        ? o.payment_splits
        : (typeof o.payment_splits === 'string'
            ? (() => { try { return JSON.parse(o.payment_splits); } catch { return null; } })()
            : null);

      if ((!splits || splits.length === 0) && (o.payment_method === 'split' || (Number(o.cash_amount || 0) > 0 && (Number(o.card_amount || 0) > 0 || Number(o.bank_transfer_amount || 0) > 0 || Number(o.wallet_amount || 0) > 0)))) {
        splits = [];
        if (Number(o.cash_amount) > 0) splits.push({ method: 'cash', amount: Number(o.cash_amount) });
        if (Number(o.card_amount) > 0) splits.push({ method: 'visa', amount: Number(o.card_amount) });
        if (Number(o.bank_transfer_amount) > 0) splits.push({ method: 'bank_transfer', amount: Number(o.bank_transfer_amount) });
        if (Number(o.wallet_amount) > 0) splits.push({ method: 'wallet', amount: Number(o.wallet_amount) });
      }
      o.payment_splits = splits;
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
      bank_transfer_paid: Number(summaryRes.rows[0]?.bank_transfer_paid || 0),
      wallet_paid: Number(summaryRes.rows[0]?.wallet_paid || 0),
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
             r.payment_method, r.cash_amount, r.card_amount, r.wallet_amount, r.bank_transfer_amount, r.payment_splits,
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
    rentals: (rentalsRes.rows || []).map(r => {
      let splits = Array.isArray(r.payment_splits)
        ? r.payment_splits
        : (typeof r.payment_splits === 'string'
            ? (() => { try { return JSON.parse(r.payment_splits); } catch { return null; } })()
            : null);

      if ((!splits || splits.length === 0) && (r.payment_method === 'split' || (Number(r.cash_amount || 0) > 0 && (Number(r.card_amount || 0) > 0 || Number(r.bank_transfer_amount || 0) > 0 || Number(r.wallet_amount || 0) > 0)))) {
        splits = [];
        if (Number(r.cash_amount) > 0) splits.push({ method: 'cash', amount: Number(r.cash_amount) });
        if (Number(r.card_amount) > 0) splits.push({ method: 'visa', amount: Number(r.card_amount) });
        if (Number(r.bank_transfer_amount) > 0) splits.push({ method: 'bank_transfer', amount: Number(r.bank_transfer_amount) });
        if (Number(r.wallet_amount) > 0) splits.push({ method: 'wallet', amount: Number(r.wallet_amount) });
      }
      return {
        ...r,
        payment_splits: splits,
      };
    }),
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
             b.name as branch_name,
             COALESCE(e.payment_method, 'cash') as payment_method
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
  let branchJoin = '';
  if (reportBranchId) {
    params.push(reportBranchId);
    branchJoin = `AND ib.branch_id = $${params.length}`;
  }

  const where = ['i.is_deleted = false'];
  const catQuery = resolveCategoryQuery(query.category);
  if (catQuery) {
    if (catQuery.type === 'suits') {
      where.push(`(i.category ILIKE '%SUIT%' OR i.category ILIKE '%بدل%')`);
    } else if (catQuery.type === 'other') {
      where.push(`(i.category IS NULL OR TRIM(i.category) = '' OR LOWER(TRIM(i.category)) IN ('أخرى', 'اخري', 'other', 'uncategorized'))`);
    } else {
      params.push(catQuery.value);
      where.push(`LOWER(TRIM(i.category)) = LOWER($${params.length})`);
    }
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

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
      LEFT JOIN inventory_branches ib ON i.id = ib.inventory_id ${branchJoin}
      ${whereSql}
      GROUP BY i.id, i.name, i.barcode, i.category, i.color, i.size_cut, i.min_stock_level, i.price, i.cost_price
      ORDER BY i.name ASC
    `, params),
    db.query(`
      SELECT COUNT(*)::int as total_items,
             COALESCE(SUM(stock_level), 0)::int as total_quantity,
             COALESCE(SUM(stock_level * price), 0) as total_retail_value,
             ${canSeeProfit ? 'COALESCE(SUM(stock_level * cost_price), 0)' : '0'} as total_cost_value,
             COUNT(CASE WHEN stock_level <= min_stock_level THEN 1 END)::int as low_stock_count
      FROM (
        SELECT i.id,
               COALESCE(SUM(ib.stock_level), 0) as stock_level,
               COALESCE(i.min_stock_level, 5) as min_stock_level,
               COALESCE(i.price, 0) as price,
               COALESCE(i.cost_price, 0) as cost_price
        FROM inventory i
        LEFT JOIN inventory_branches ib ON i.id = ib.inventory_id ${branchJoin}
        ${whereSql}
        GROUP BY i.id, i.min_stock_level, i.price, i.cost_price
      ) sub
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

async function getExtendedDailyReport(query = {}, user = null) {
  let date = query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = (await getDatabaseCairoNow(db)).date;
  }
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const range = getDayRange(date);
  const branchFilterOrders = reportBranchId ? 'AND o.branch_id = $3' : '';
  const branchFilterEmp = reportBranchId ? 'AND e.branch_id = $3' : '';
  const branchFilterExp = reportBranchId ? 'AND e.branch_id = $3' : '';

  const params = [range.start, range.end];
  if (reportBranchId) params.push(reportBranchId);

  const [ordersRes, advancesRes, expensesRes, attendanceRes] = await Promise.all([
    // Table 1: Sales Invoices
    db.query(`
      SELECT 
        o.id,
        COALESCE(o.branch_invoice_number::text, o.id::text) as invoice_number,
        TO_CHAR(o.order_date, 'YYYY-MM-DD') as invoice_date,
        TO_CHAR(o.order_date, 'HH12:MI AM') as invoice_time,
        COALESCE(
          STRING_AGG(DISTINCT i.name, ' + ') FILTER (WHERE i.name IS NOT NULL),
          'فاتورة بيع'
        ) || COALESCE(' + ' || NULLIF(alt.description, ''), '') as description,
        o.total_amount,
        o.paid_amount,
        GREATEST(o.total_amount - o.paid_amount, 0) as remaining_amount,
        COALESCE(e.name, 'غير محدد') as seller_name,
        TO_CHAR(COALESCE(alt.due_date, o.order_date::date), 'YYYY-MM-DD') as delivery_date,
        ${normalizedPaymentMethodSql('o.payment_method')} as payment_method,
        o.payment_method as raw_payment_method,
        o.cash_amount,
        o.card_amount,
        o.bank_transfer_amount,
        o.wallet_amount,
        o.payment_splits
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN inventory i ON oi.inventory_id = i.id
      LEFT JOIN employees e ON o.seller_id = e.id
      LEFT JOIN (
        SELECT order_id, STRING_AGG(description, ' + ') as description, MAX(due_date) as due_date
        FROM alterations
        GROUP BY order_id
      ) alt ON alt.order_id = o.id
      WHERE o.status <> 'cancelled'
        AND o.order_date >= $1::date AND o.order_date < $2::date
        ${branchFilterOrders}
      GROUP BY o.id, o.branch_invoice_number, o.order_date, o.total_amount, o.paid_amount, e.name, o.payment_method, alt.description, alt.due_date, o.cash_amount, o.card_amount, o.bank_transfer_amount, o.wallet_amount, o.payment_splits
      ORDER BY o.order_date ASC, o.id ASC
    `, params),

    // Table 2: Employee Advances
    db.query(`
      SELECT 
        et.id,
        et.employee_id,
        e.name as employee_name,
        et.amount,
        COALESCE(et.notes, '') as notes,
        TO_CHAR(et.transaction_date, 'YYYY-MM-DD') as transaction_date
      FROM employee_transactions et
      JOIN employees e ON et.employee_id = e.id
      WHERE et.type = 'advance'
        AND et.transaction_date >= $1::date AND et.transaction_date < $2::date
        ${branchFilterEmp}
      ORDER BY et.id ASC
    `, params),

    // Table 3: Expenses and other collections
    db.query(`
      SELECT 
        e.id,
        COALESCE(NULLIF(e.notes, ''), e.category, 'مصروفات آخرى') as description,
        e.amount,
        ${normalizedPaymentMethodSql('e.payment_method')} as payment_method,
        e.payment_method as raw_payment_method,
        e.category,
        TO_CHAR(e.expense_date, 'YYYY-MM-DD') as expense_date
      FROM expenses e
      WHERE e.is_deleted IS NOT TRUE
        AND e.category <> 'bonus'
        AND e.expense_date >= $1::date AND e.expense_date < $2::date
        ${branchFilterExp}
      ORDER BY e.id ASC
    `, params),

    // Table 4: Attendance & Hours
    db.query(`
      SELECT 
        e.id as employee_id,
        e.name as employee_name,
        a.id as attendance_id,
        TO_CHAR(a.check_in, 'HH12:MI AM') as check_in,
        TO_CHAR(a.check_out, 'HH12:MI AM') as check_out,
        TO_CHAR(a.check_in, 'HH24:MI') as check_in_24,
        TO_CHAR(a.check_out, 'HH24:MI') as check_out_24,
        COALESCE(a.total_hours, 0) as total_hours,
        COALESCE(a.notes, '') as notes,
        COALESCE(a.status, 'absent') as status,
        e.basic_salary
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = $1::date
      WHERE e.status = 'active'
        ${reportBranchId ? 'AND e.branch_id = $2' : ''}
      ORDER BY e.id ASC
    `, [range.start, ...(reportBranchId ? [reportBranchId] : [])]),
  ]);

  const salesInvoices = ordersRes.rows.map(row => {
    let splits = Array.isArray(row.payment_splits)
      ? row.payment_splits
      : (typeof row.payment_splits === 'string'
          ? (() => { try { return JSON.parse(row.payment_splits); } catch { return null; } })()
          : (row.payment_splits || null));

    if ((!splits || splits.length === 0) && (row.payment_method === 'split' || row.raw_payment_method === 'split')) {
      splits = [];
      if (Number(row.cash_amount) > 0) splits.push({ method: 'cash', amount: Number(row.cash_amount) });
      if (Number(row.card_amount) > 0) splits.push({ method: 'card', amount: Number(row.card_amount) });
      if (Number(row.bank_transfer_amount) > 0) splits.push({ method: 'bank_transfer', amount: Number(row.bank_transfer_amount) });
      if (Number(row.wallet_amount) > 0) splits.push({ method: 'wallet', amount: Number(row.wallet_amount) });
    }

    return {
      ...row,
      payment_splits: splits,
      seller_name: row.seller_name || 'غير محدد',
      cashier_name: row.seller_name || 'غير محدد',
      delivery_date: row.delivery_date,
      pickup_date: row.delivery_date,
      invoice_date: row.invoice_date,
      order_date_cairo: row.invoice_date,
      invoice_number: row.invoice_number,
      branch_invoice_number: row.invoice_number,
      total_amount: Number(row.total_amount || 0),
      paid_amount: Number(row.paid_amount || 0),
      remaining_amount: Number(row.remaining_amount || 0),
    };
  });

  const advances = advancesRes.rows.map(row => ({
    ...row,
    amount: Number(row.amount || 0),
  }));

  const expenses = expensesRes.rows.map(row => ({
    ...row,
    amount: Number(row.amount || 0),
  }));

  const attendance = attendanceRes.rows.map(row => ({
    ...row,
    total_hours: Number(row.total_hours || 0),
    basic_salary: Number(row.basic_salary || 0),
  }));

  const totalSales = salesInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const totalPaid = salesInvoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const totalAdvances = advances.reduce((sum, adv) => sum + adv.amount, 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalDeductions = totalAdvances + totalExpenses;

  const cashCollected = salesInvoices.reduce((sum, inv) => {
    if (inv.payment_method === 'cash') return sum + inv.paid_amount;
    if (Number(inv.cash_amount) > 0) return sum + Number(inv.cash_amount);
    return sum;
  }, 0);
  const cashExpenses = expenses.reduce((sum, exp) => {
    return exp.payment_method === 'cash' ? sum + exp.amount : sum;
  }, 0);

  const cashDrawerExcel = totalPaid - totalDeductions;
  const physicalCashInDrawer = Math.max(0, cashCollected - cashExpenses - totalAdvances);

  return {
    date,
    sales_invoices: salesInvoices,
    advances,
    expenses,
    attendance,
    summary: {
      total_sales: totalSales,
      total_paid: totalPaid,
      total_advances: totalAdvances,
      total_expenses: totalExpenses,
      total_deductions: totalDeductions,
      cash_in_drawer: cashDrawerExcel,
      physical_cash_in_drawer: physicalCashInDrawer,
      cash_collected: cashCollected,
      cash_expenses: cashExpenses,
    }
  };
}

async function getMonthlyOhdaReport(query = {}, user = null) {
  let month = query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    month = (await getDatabaseCairoNow(db)).month;
  }
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const monthStart = `${month}-01`;
  const monthEnd = addDays(`${month}-${String(daysInMonth).padStart(2, '0')}`, 1);

  const empFilter = reportBranchId ? 'AND e.branch_id = $1' : '';
  const empParams = reportBranchId ? [reportBranchId] : [];

  const [employeesRes, attendanceRes, advancesRes] = await Promise.all([
    db.query(`
      SELECT e.id, e.name, e.basic_salary, e.branch_id, b.name as branch_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.status = 'active' ${empFilter}
      ORDER BY e.id ASC
    `, empParams),

    db.query(`
      SELECT 
        a.employee_id,
        TO_CHAR(a.date, 'YYYY-MM-DD') as date,
        EXTRACT(DAY FROM a.date)::int as day,
        a.status,
        a.notes,
        a.total_hours
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.date >= $1::date AND a.date < $2::date
        ${reportBranchId ? 'AND e.branch_id = $3' : ''}
    `, [monthStart, monthEnd, ...(reportBranchId ? [reportBranchId] : [])]),

    db.query(`
      SELECT 
        et.employee_id,
        TO_CHAR(et.transaction_date, 'YYYY-MM-DD') as date,
        EXTRACT(DAY FROM et.transaction_date)::int as day,
        et.amount,
        et.notes
      FROM employee_transactions et
      JOIN employees e ON et.employee_id = e.id
      WHERE et.type = 'advance'
        AND et.transaction_date >= $1::date AND et.transaction_date < $2::date
        ${reportBranchId ? 'AND e.branch_id = $3' : ''}
    `, [monthStart, monthEnd, ...(reportBranchId ? [reportBranchId] : [])])
  ]);

  const arabicDayNames = ['الأحد', 'الأثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const daysMeta = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    const dateObj = new Date(`${month}-${dStr}T00:00:00Z`);
    const dayOfWeek = dateObj.getUTCDay();
    daysMeta.push({
      day: d,
      date: `${month}-${dStr}`,
      dayName: arabicDayNames[dayOfWeek],
    });
  }

  const attendanceMap = new Map();
  attendanceRes.rows.forEach(row => {
    attendanceMap.set(`${row.employee_id}_${row.day}`, row);
  });

  const advancesMap = new Map();
  advancesRes.rows.forEach(row => {
    const key = `${row.employee_id}_${row.day}`;
    advancesMap.set(key, (advancesMap.get(key) || 0) + Number(row.amount || 0));
  });

  const employees = employeesRes.rows.map(emp => {
    const empId = emp.id;
    const basicSalary = Number(emp.basic_salary || 0);
    const dailyRate = Math.round(basicSalary / 30);

    const days = [];
    let advances1to10 = 0;
    let advances11to20 = 0;
    let advances21toEnd = 0;
    let totalAdvances = 0;
    let totalAttendance = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const att = attendanceMap.get(`${empId}_${d}`);
      const adv = advancesMap.get(`${empId}_${d}`) || 0;

      let isPresent = 0;
      if (att) {
        const isAbsent = (att.status === 'absent') || (att.notes && att.notes.includes('غياب'));
        if (!isAbsent && (att.status === 'present' || att.status === 'leave' || Number(att.total_hours) > 0 || att.check_in)) {
          isPresent = 1;
        }
      }

      if (isPresent) totalAttendance += 1;
      if (adv > 0) {
        totalAdvances += adv;
        if (d <= 10) advances1to10 += adv;
        else if (d <= 20) advances11to20 += adv;
        else advances21toEnd += adv;
      }

      days.push({
        day: d,
        attendance: isPresent,
        advance: adv,
        notes: att?.notes || '',
        total_hours: Number(att?.total_hours || 0),
      });
    }

    const monthEntitlement = totalAttendance >= 26 ? basicSalary : totalAttendance * dailyRate;

    return {
      employee_id: empId,
      employee_name: emp.name,
      branch_name: emp.branch_name,
      basic_salary: basicSalary,
      daily_rate: dailyRate,
      days,
      advances_1_to_10: advances1to10,
      advances_11_to_20: advances11to20,
      advances_21_to_31: advances21toEnd,
      total_advances: totalAdvances,
      total_attendance: totalAttendance,
      month_entitlement: monthEntitlement,
    };
  });

  const totalAdvances1to10 = employees.reduce((s, e) => s + (e.advances_1_to_10 || 0), 0);
  const totalAdvances11to20 = employees.reduce((s, e) => s + (e.advances_11_to_20 || 0), 0);
  const totalAdvances21to31 = employees.reduce((s, e) => s + (e.advances_21_to_31 || 0), 0);
  const totalAdvancesAll = employees.reduce((s, e) => s + (e.total_advances || 0), 0);
  const totalAttendanceAll = employees.reduce((s, e) => s + (e.total_attendance || 0), 0);
  const totalEntitlementAll = employees.reduce((s, e) => s + (e.month_entitlement || 0), 0);

  return {
    month,
    daysInMonth,
    daysMeta,
    employees,
    summary: {
      total_employees: employees.length,
      total_attendance: totalAttendanceAll,
      total_advances_1_10: totalAdvances1to10,
      total_advances_11_20: totalAdvances11to20,
      total_advances_21_31: totalAdvances21to31,
      total_advances: totalAdvancesAll,
      total_entitlement: totalEntitlementAll,
    },
  };
}

async function getMonthlySalarySheet(query = {}, user = null) {
  let month = query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    month = (await getDatabaseCairoNow(db)).month;
  }
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const monthStart = `${month}-01`;
  const monthEnd = addDays(`${month}-${String(daysInMonth).padStart(2, '0')}`, 1);

  const empFilter = reportBranchId ? 'AND e.branch_id = $1' : '';
  const empParams = reportBranchId ? [reportBranchId] : [];

  const [employeesRes, attendanceRes, transactionsRes] = await Promise.all([
    db.query(`
      SELECT e.id, e.name, e.basic_salary, e.branch_id, b.name as branch_name
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE e.status = 'active' ${empFilter}
      ORDER BY e.id ASC
    `, empParams),

    db.query(`
      SELECT 
        a.employee_id,
        a.status,
        a.notes,
        COALESCE(a.total_hours, 0) as total_hours
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.date >= $1::date AND a.date < $2::date
        ${reportBranchId ? 'AND e.branch_id = $3' : ''}
    `, [monthStart, monthEnd, ...(reportBranchId ? [reportBranchId] : [])]),

    db.query(`
      SELECT 
        et.employee_id,
        et.type,
        et.amount,
        et.notes
      FROM employee_transactions et
      JOIN employees e ON et.employee_id = e.id
      WHERE et.transaction_date >= $1::date AND et.transaction_date < $2::date
        ${reportBranchId ? 'AND e.branch_id = $3' : ''}
    `, [monthStart, monthEnd, ...(reportBranchId ? [reportBranchId] : [])])
  ]);

  const empAttendance = new Map();
  attendanceRes.rows.forEach(r => {
    const current = empAttendance.get(r.employee_id) || {
      total_hours: 0,
      absent_count: 0,
      leave_count: 0,
      half_day_count: 0,
    };
    current.total_hours += Number(r.total_hours || 0);
    const notes = String(r.notes || '');
    const status = String(r.status || '');

    if (notes.includes('غياب') || status === 'absent') {
      current.absent_count += 1;
    }
    if (notes.includes('جاز') || notes.includes('إجازة') || status === 'leave') {
      current.leave_count += 1;
    }
    if (notes.includes('نص يوم') || status === 'half_day') {
      current.half_day_count += 1;
    }
    empAttendance.set(r.employee_id, current);
  });

  const empTransactions = new Map();
  transactionsRes.rows.forEach(r => {
    const current = empTransactions.get(r.employee_id) || {
      advances: 0,
      deductions: 0,
      bonuses: 0,
    };
    const amt = Number(r.amount || 0);
    if (r.type === 'advance') current.advances += amt;
    else if (r.type === 'deduction') current.deductions += amt;
    else if (r.type === 'bonus') current.bonuses += amt;
    empTransactions.set(r.employee_id, current);
  });

  const salarySheet = employeesRes.rows.map(emp => {
    const empId = emp.id;
    const basicSalary = Number(emp.basic_salary || 0);
    const dailyRate = Math.round((basicSalary / 30) * 100) / 100;
    const att = empAttendance.get(empId) || { total_hours: 0, absent_count: 0, leave_count: 0, half_day_count: 0 };
    const tx = empTransactions.get(empId) || { advances: 0, deductions: 0, bonuses: 0 };

    const requiredHours = 268;
    const actualHours = Math.round(att.total_hours * 100) / 100;
    const delayHours = actualHours < requiredHours ? Math.round((requiredHours - actualHours) * 100) / 100 : 0;
    const overtimeHours = actualHours > requiredHours ? Math.round((actualHours - requiredHours) * 100) / 100 : 0;
    const overtimeAmount = Math.round(((dailyRate / 10) * 1.35) * overtimeHours);

    const workDays = 30;
    const allowances = tx.bonuses;
    const transportationAllowance = 0;
    const grossSalary = basicSalary + allowances + overtimeAmount + transportationAllowance;

    const advances = tx.advances;
    const absentDays = att.absent_count;
    const absentDeduction = Math.round(absentDays * dailyRate * 2);

    const leaveDays = att.leave_count;
    const leaveDeduction = Math.round(Math.max(0, leaveDays - 4) * dailyRate);

    const halfDays = att.half_day_count;
    const halfDayDeduction = Math.round(halfDays * (dailyRate / 2));

    const delayDeduction = Math.round(delayHours * (dailyRate / 10));
    const otherDeductions = tx.deductions;
    const oldDebts = 0;
    const externalDebts = 0;

    const netSalary = Math.round(
      grossSalary - advances - absentDeduction - leaveDeduction - halfDayDeduction - delayDeduction - otherDeductions - oldDebts - externalDebts
    );

    return {
      employee_id: empId,
      employee_name: emp.name,
      branch_name: emp.branch_name,
      actual_hours: actualHours,
      required_hours: requiredHours,
      delay_hours: delayHours,
      allowances,
      overtime_hours: overtimeHours,
      overtime_amount: overtimeAmount,
      basic_salary: basicSalary,
      daily_rate: dailyRate,
      gross_salary: grossSalary,
      work_days: workDays,
      transportation_allowance: transportationAllowance,
      advances,
      absent_days: absentDays,
      absent_deduction: absentDeduction,
      leave_days: leaveDays,
      leave_deduction: leaveDeduction,
      half_days: halfDays,
      half_day_deduction: halfDayDeduction,
      other_deductions: otherDeductions,
      delay_deduction: delayDeduction,
      net_salary: netSalary,
      old_debts: oldDebts,
      external_debts: externalDebts,
    };
  });

  const summary = {
    total_employees: salarySheet.length,
    total_basic_salaries: salarySheet.reduce((s, e) => s + (e.basic_salary || 0), 0),
    total_gross_salaries: salarySheet.reduce((s, e) => s + (e.gross_salary || 0), 0),
    total_net_salary: salarySheet.reduce((s, e) => s + (e.net_salary || 0), 0),
    total_advances: salarySheet.reduce((s, e) => s + (e.advances || 0), 0),
    total_actual_hours: salarySheet.reduce((s, e) => s + (e.actual_hours || 0), 0),
    total_delay_hours: salarySheet.reduce((s, e) => s + (e.delay_hours || 0), 0),
    total_overtime_hours: salarySheet.reduce((s, e) => s + (e.overtime_hours || 0), 0),
    total_overtime_amount: salarySheet.reduce((s, e) => s + (e.overtime_amount || 0), 0),
    total_absent_days: salarySheet.reduce((s, e) => s + (e.absent_days || 0), 0),
    total_absent_deductions: salarySheet.reduce((s, e) => s + (e.absent_deduction || 0), 0),
    total_leave_days: salarySheet.reduce((s, e) => s + (e.leave_days || 0), 0),
    total_leave_deductions: salarySheet.reduce((s, e) => s + (e.leave_deduction || 0), 0),
    total_half_days: salarySheet.reduce((s, e) => s + (e.half_days || 0), 0),
    total_half_day_deductions: salarySheet.reduce((s, e) => s + (e.half_day_deduction || 0), 0),
    total_delay_deductions: salarySheet.reduce((s, e) => s + (e.delay_deduction || 0), 0),
    total_other_deductions: salarySheet.reduce((s, e) => s + (e.other_deductions || 0), 0),
  };

  return {
    month,
    employees: salarySheet,
    summary,
  };
}

async function getSalesKpiReport(query = {}, user = null) {
  let month = query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    month = (await getDatabaseCairoNow(db)).month;
  }
  const reportBranchId = getReportBranchId(user, query);
  if (user && user.role !== 'admin' && !reportBranchId) {
    const err = new Error('Branch user must have a branch_id');
    err.statusCode = 403;
    throw err;
  }

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const monthStart = `${month}-01`;
  const monthEnd = addDays(`${month}-${String(daysInMonth).padStart(2, '0')}`, 1);

  const empBranchFilter = reportBranchId ? 'AND e.branch_id = $3' : '';
  const orderBranchFilter = reportBranchId ? 'AND o.branch_id = $3' : '';
  const params = [monthStart, monthEnd];
  if (reportBranchId) params.push(reportBranchId);

  const res = await db.query(`
    SELECT 
      e.id as seller_id,
      e.name as seller_name,
      COALESCE(b.name, '-') as branch_name,
      COALESCE(SUM(o.total_amount), 0) as total_sales,
      COALESCE(SUM(o.paid_amount), 0) as total_paid,
      COUNT(o.id)::int as orders_count
    FROM employees e
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN orders o ON o.seller_id = e.id
      AND o.status <> 'cancelled'
      AND o.order_date >= $1::date AND o.order_date < $2::date
      ${orderBranchFilter}
    WHERE e.status = 'active'
      ${empBranchFilter}
    GROUP BY e.id, e.name, b.name
    ORDER BY total_sales DESC, e.name ASC
  `, params);

  const target = 50000;
  const sellers = res.rows.map(row => {
    const totalSales = Number(row.total_sales || 0);
    const achievementPercentage = target > 0 ? Math.round((totalSales / target) * 100 * 10) / 10 : 0;
    return {
      seller_id: row.seller_id,
      seller_name: row.seller_name,
      branch_name: row.branch_name,
      total_sales: totalSales,
      total_paid: Number(row.total_paid || 0),
      orders_count: row.orders_count,
      target,
      achievement_percentage: achievementPercentage,
    };
  });

  return {
    month,
    sellers,
    summary: {
      total_sales: sellers.reduce((sum, s) => sum + s.total_sales, 0),
      total_orders: sellers.reduce((sum, s) => sum + s.orders_count, 0),
      average_achievement: sellers.length > 0
        ? Math.round((sellers.reduce((sum, s) => sum + s.achievement_percentage, 0) / sellers.length) * 10) / 10
        : 0,
    }
  };
}

async function updateDailyAttendanceQuick(data = {}, user = null) {
  if (!user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const { employee_id, date, check_in, check_out, notes, status } = data || {};
  if (!employee_id || !date) {
    const err = new Error('employee_id and date are required');
    err.statusCode = 400;
    throw err;
  }

  const empRes = await db.query('SELECT branch_id, name FROM employees WHERE id = $1', [employee_id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }
  const emp = empRes.rows[0];
  if (user.role !== 'admin' && String(user.branch_id) !== String(emp.branch_id)) {
    const err = new Error('Forbidden: Cannot modify employees from other branches');
    err.statusCode = 403;
    throw err;
  }

  const existingAttRes = await db.query(
    'SELECT check_in, check_out, total_hours, notes, status FROM attendance WHERE employee_id = $1 AND date = $2',
    [employee_id, date]
  );
  const existingAtt = existingAttRes.rows[0];

  const effectiveCheckIn = (check_in !== undefined && check_in !== null && check_in !== '')
    ? check_in
    : (existingAtt?.check_in ? String(existingAtt.check_in).slice(0, 5) : null);

  const effectiveCheckOut = (check_out !== undefined && check_out !== null && check_out !== '')
    ? check_out
    : (existingAtt?.check_out ? String(existingAtt.check_out).slice(0, 5) : null);

  let totalHours = Number(data.total_hours);
  if (!Number.isFinite(totalHours) || totalHours === 0) {
    if (effectiveCheckIn && effectiveCheckOut) {
      const inTime = new Date(`${date}T${effectiveCheckIn}`);
      const outTime = new Date(`${date}T${effectiveCheckOut}`);
      if (!isNaN(inTime) && !isNaN(outTime)) {
        if (outTime < inTime) outTime.setDate(outTime.getDate() + 1);
        totalHours = Math.round(((outTime - inTime) / 3600000) * 100) / 100;
      }
    } else if (existingAtt?.total_hours && (check_in === undefined || check_in === null || check_in === '') && (check_out === undefined || check_out === null || check_out === '')) {
      totalHours = Number(existingAtt.total_hours);
    }
  }
  if (!Number.isFinite(totalHours)) totalHours = 0;

  let resolvedStatus = status || (existingAtt?.status || 'present');
  const notesStr = String(notes !== undefined && notes !== null ? notes : (existingAtt?.notes || ''));
  if (notesStr.includes('غياب')) resolvedStatus = 'absent';
  else if (notesStr.includes('جاز') || notesStr.includes('إجازة')) resolvedStatus = 'leave';
  else if (notesStr.includes('نص يوم')) resolvedStatus = 'half_day';
  else if (effectiveCheckIn || totalHours > 0) resolvedStatus = 'present';

  const res = await db.query(`
    INSERT INTO attendance (employee_id, date, check_in, check_out, total_hours, notes, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (employee_id, date)
    DO UPDATE SET
      check_in = EXCLUDED.check_in,
      check_out = EXCLUDED.check_out,
      total_hours = EXCLUDED.total_hours,
      notes = EXCLUDED.notes,
      status = EXCLUDED.status
    RETURNING *
  `, [
    employee_id,
    date,
    effectiveCheckIn || null,
    effectiveCheckOut || null,
    totalHours,
    notesStr || null,
    resolvedStatus
  ]);

  return {
    success: true,
    ...res.rows[0],
    attendance: res.rows[0],
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
  getExtendedDailyReport,
  getMonthlyOhdaReport,
  getMonthlySalarySheet,
  getSalesKpiReport,
  updateDailyAttendanceQuick,
  getSummaryReport,
  getSalesReport,
  getRentalsReport,
  getExpensesReport,
  getInventoryReport,
};

