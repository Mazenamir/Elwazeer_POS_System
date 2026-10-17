const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const { isBranchScopedUser, hasInventoryAdminAccess } = require('../../../shared/constants/permissions');
const { getCairoDateTimeParts, getDatabaseCairoNow } = require('../../../shared/utils/date');
const { likePattern, newUuid } = require('../../../shared/utils/string');
const { parsePositiveInt } = require('../../../shared/utils/numbers');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { queueSyncOperation, logActivity } = require('../../database/sync.helpers');

async function getExpensesSummary(query = {}, user = null) {
  const branchParams = [];
  let branchClause = '';

  if (user && user.role !== 'admin') {
    branchParams.push(user.branch_id);
    branchClause = `AND branch_id = $${branchParams.length}`;
  } else if (query.branch_id && query.branch_id !== 'all') {
    branchParams.push(query.branch_id);
    branchClause = `AND branch_id = $${branchParams.length}`;
  }

  // Baseline today & month stats
  const monthStartSql = `date_trunc('month', ${CAIRO_DATE_SQL})::date`;
  const monthEndSql = `(date_trunc('month', ${CAIRO_DATE_SQL}) + INTERVAL '1 month')::date`;

  const { rows: baselineRows } = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN expense_date = ${CAIRO_DATE_SQL} THEN amount ELSE 0 END), 0) as today,
      COALESCE(SUM(CASE WHEN expense_date >= ${monthStartSql} AND expense_date < ${monthEndSql} THEN amount ELSE 0 END), 0) as month
    FROM expenses
    WHERE is_deleted IS NOT TRUE ${branchClause}
  `, branchParams);

  // Period / Filtered summary
  const filterParams = [];
  const filterWhere = ['is_deleted IS NOT TRUE'];

  if (user && user.role !== 'admin') {
    filterParams.push(user.branch_id);
    filterWhere.push(`branch_id = $${filterParams.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    filterParams.push(query.branch_id);
    filterWhere.push(`branch_id = $${filterParams.length}`);
  }

  if (query.category && query.category !== 'all') {
    filterParams.push(query.category);
    filterWhere.push(`category = $${filterParams.length}`);
  }

  if (query.payment_method && query.payment_method !== 'all') {
    filterParams.push(query.payment_method);
    filterWhere.push(`COALESCE(payment_method, 'cash') = $${filterParams.length}`);
  }

  if (query.cashier_id && query.cashier_id !== 'all') {
    filterParams.push(query.cashier_id);
    filterWhere.push(`created_by = $${filterParams.length}`);
  }

  if (query.date_from) {
    filterParams.push(query.date_from);
    filterWhere.push(`expense_date >= $${filterParams.length}::date`);
  }

  if (query.date_to) {
    filterParams.push(query.date_to);
    filterWhere.push(`expense_date < ($${filterParams.length}::date + INTERVAL '1 day')`);
  }

  if (query.search) {
    filterParams.push(likePattern(query.search));
    filterWhere.push(`(COALESCE(notes, '') ILIKE $${filterParams.length} OR COALESCE(category, '') ILIKE $${filterParams.length})`);
  }

  if (query.min_amount !== undefined && query.min_amount !== '') {
    const minAmount = Number(query.min_amount);
    if (Number.isFinite(minAmount) && minAmount >= 0) {
      filterParams.push(minAmount);
      filterWhere.push(`amount >= $${filterParams.length}`);
    }
  }

  if (query.max_amount !== undefined && query.max_amount !== '') {
    const maxAmount = Number(query.max_amount);
    if (Number.isFinite(maxAmount) && maxAmount >= 0) {
      filterParams.push(maxAmount);
      filterWhere.push(`amount <= $${filterParams.length}`);
    }
  }

  const filterWhereClause = filterWhere.length ? `WHERE ${filterWhere.join(' AND ')}` : '';
  const { rows: filteredRows } = await db.query(`
    SELECT
      COUNT(*)::int as count,
      COALESCE(SUM(amount), 0) as period_total,
      COALESCE(SUM(CASE WHEN COALESCE(payment_method, 'cash') = 'cash' THEN amount ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN COALESCE(payment_method, 'cash') <> 'cash' THEN amount ELSE 0 END), 0) as non_cash_total
    FROM expenses
    ${filterWhereClause}
  `, filterParams);

  return {
    today: Number(baselineRows[0]?.today || 0),
    month: Number(baselineRows[0]?.month || 0),
    period_total: Number(filteredRows[0]?.period_total || 0),
    cash_total: Number(filteredRows[0]?.cash_total || 0),
    non_cash_total: Number(filteredRows[0]?.non_cash_total || 0),
    count: Number(filteredRows[0]?.count || 0),
  };
}

async function listExpenses(query = {}, user = null) {
  const pagination = parsePagination(query, 50, 200, true);
  const params = [];
  const where = ['e.is_deleted IS NOT TRUE'];

  if (user && user.role !== 'admin') {
    params.push(user.branch_id);
    where.push(`e.branch_id = $${params.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`e.branch_id = $${params.length}`);
  }

  if (query.category && query.category !== 'all') {
    params.push(query.category);
    where.push(`e.category = $${params.length}`);
  }

  if (query.payment_method && query.payment_method !== 'all') {
    params.push(query.payment_method);
    where.push(`COALESCE(e.payment_method, 'cash') = $${params.length}`);
  }

  if (query.cashier_id && query.cashier_id !== 'all') {
    params.push(query.cashier_id);
    where.push(`e.created_by = $${params.length}`);
  }

  if (query.date_from) {
    params.push(query.date_from);
    where.push(`e.expense_date >= $${params.length}::date`);
  }

  if (query.date_to) {
    params.push(query.date_to);
    where.push(`e.expense_date < ($${params.length}::date + INTERVAL '1 day')`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(
      COALESCE(e.notes, '') ILIKE $${params.length}
      OR COALESCE(e.category, '') ILIKE $${params.length}
      OR COALESCE(u.username, '') ILIKE $${params.length}
    )`);
  }

  if (query.min_amount !== undefined && query.min_amount !== '') {
    const minAmount = Number(query.min_amount);
    if (!Number.isFinite(minAmount) || minAmount < 0) {
      const err = new Error('Invalid minimum amount');
      err.statusCode = 400;
      throw err;
    }
    params.push(minAmount);
    where.push(`e.amount >= $${params.length}`);
  }

  if (query.max_amount !== undefined && query.max_amount !== '') {
    const maxAmount = Number(query.max_amount);
    if (!Number.isFinite(maxAmount) || maxAmount < 0) {
      const err = new Error('Invalid maximum amount');
      err.statusCode = 400;
      throw err;
    }
    params.push(maxAmount);
    where.push(`e.amount <= $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  let selectQuery = `
    SELECT e.*,
           b.name as branch_name,
           COALESCE(u.username, 'النظام') as cashier_name,
           COALESCE(u.username, 'النظام') as created_by_name,
           ub.username as updated_by_name
    FROM expenses e
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN users u ON e.created_by = u.id
    LEFT JOIN users ub ON e.updated_by = ub.id
    ${whereClause}
    ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
  `;

  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM expenses e
    LEFT JOIN users u ON e.created_by = u.id
    ${whereClause}
  `;
  const queryParams = [...params];

  const sanitizeExpenseRow = (row) => ({
    ...row,
    notes: row.notes ? row.notes.replace(/\s*\[EXP-[^\]]+\]\s*/g, ' ').trim() || null : null,
  });

  if (pagination.enabled) {
    selectQuery = appendPagination(selectQuery, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(selectQuery, queryParams),
      db.query(countQuery, params),
    ]);
    return paginatedPayload(dataRes.rows.map(sanitizeExpenseRow), countRes.rows[0]?.total || 0, pagination);
  }

  const result = await db.query(selectQuery, queryParams);
  return result.rows.map(sanitizeExpenseRow);
}

async function listExpenseCashiers(user = null) {
  const params = [];
  let branchFilter = '';
  if (user && user.role !== 'admin') {
    params.push(user.branch_id);
    branchFilter = `WHERE (branch_id = $${params.length} OR branch_id IS NULL)`;
  }
  const { rows } = await db.query(`
    SELECT id, username, role, branch_id
    FROM users
    ${branchFilter}
    ORDER BY username ASC
  `, params);
  return rows;
}

async function createExpense(body, user, req) {
  let { branch_id, category, amount, expense_date, notes, employee_id, payment_method } = body || {};
  const offlineUuid = newUuid(body?.offline_uuid);

  if (user && user.role !== 'admin') {
    branch_id = user.branch_id;
  }

  const final_branch_id = (branch_id === '' || branch_id === undefined) ? null : Number(branch_id);
  const final_amount = Number((amount === '' || amount === undefined) ? 0 : amount);
  const final_payment_method = ['cash', 'card', 'bank_transfer', 'wallet'].includes(payment_method) ? payment_method : 'cash';

  if (!category || !Number.isFinite(final_amount) || final_amount <= 0) {
    const err = new Error('مبلغ المصروف يجب أن يكون أكبر من صفر');
    err.statusCode = 400;
    throw err;
  }

  if (category === 'bonus' && !employee_id) {
    const err = new Error('يجب اختيار الموظف للمكافأة');
    err.statusCode = 400;
    throw err;
  }

  if (category === 'bonus' && !final_branch_id) {
    const err = new Error('يجب اختيار فرع الموظف للمكافأة');
    err.statusCode = 400;
    throw err;
  }

  if (!config.IS_BRANCH_MODE && !(await db.isPrimaryDbAvailable())) {
    const err = new Error('قاعدة البيانات غير متاحة حالياً. يرجى المحاولة بعد قليل.');
    err.statusCode = 503;
    err.retry_after = 30;
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  // Prevent duplicate submissions within 3 seconds
  if (user?.id) {
    const { rows: dupRows } = await db.query(`
      SELECT id, offline_uuid FROM expenses
      WHERE created_by = $1 AND branch_id = $2 AND amount = $3 AND category = $4 AND is_deleted IS NOT TRUE
        AND created_at >= NOW() - INTERVAL '3 seconds'
      ORDER BY id DESC LIMIT 1
    `, [user.id, final_branch_id, final_amount, category]);
    if (dupRows.length > 0) {
      return dupRows[0];
    }
  }

  const expense = await db.transaction(async (tx) => {
    const cairoNow = await getDatabaseCairoNow(tx);
    const cairoDate = cairoNow.date;
    let finalNotes = notes || null;
    let bonusEmployeeId = null;

    if (category === 'bonus') {
      const employeeRes = await tx.query('SELECT id, name, branch_id FROM employees WHERE id = $1', [employee_id]);
      if (employeeRes.rows.length === 0) {
        const err = new Error('الموظف غير موجود');
        err.statusCode = 400;
        throw err;
      }
      const employee = employeeRes.rows[0];
      if (final_branch_id && Number(employee.branch_id) !== Number(final_branch_id)) {
        const err = new Error('الموظف لا يتبع الفرع المختار');
        err.statusCode = 400;
        throw err;
      }
      bonusEmployeeId = employee.id;
      const cleanUserNotes = (notes || '').replace(/\s*\[EXP-[^\]]+\]\s*/g, '').trim();
      finalNotes = cleanUserNotes
        ? `${cleanUserNotes} - مكسرات للموظف: ${employee.name}`
        : `مكسرات ومكافأة للموظف: ${employee.name}`;
    }

    const result = await tx.query(
      `INSERT INTO expenses (
         branch_id, category, amount, expense_date, notes, offline_uuid,
         payment_method, created_by, updated_by, created_at, updated_at, is_deleted
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW(), NOW(), FALSE)
       ON CONFLICT (offline_uuid) DO UPDATE SET
         category = EXCLUDED.category,
         amount = EXCLUDED.amount,
         payment_method = EXCLUDED.payment_method,
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [
        final_branch_id,
        category,
        final_amount,
        expense_date || cairoDate,
        finalNotes,
        offlineUuid,
        final_payment_method,
        user ? user.id : null,
      ]
    );

    if (bonusEmployeeId) {
      const existingBonus = await tx.query(
        "SELECT id FROM employee_transactions WHERE (offline_uuid = $1 OR notes LIKE $2) AND employee_id = $3 AND type = 'bonus' LIMIT 1",
        [offlineUuid, `%[EXP-${offlineUuid}]%`, bonusEmployeeId]
      );
      if (!existingBonus.rows.length) {
        await tx.query(
          'INSERT INTO employee_transactions (employee_id, type, amount, transaction_date, notes, offline_uuid) VALUES ($1, $2, $3, $4, $5, $6)',
          [bonusEmployeeId, 'bonus', final_amount, expense_date || cairoDate, finalNotes, offlineUuid]
        );
      }
    }

    await queueSyncOperation(tx, req, 'expense', 'upsert', result.rows[0].id, final_branch_id, {
      ...result.rows[0],
      employee_id: bonusEmployeeId,
    });

    await logActivity(
      user ? user.id : null,
      user ? user.username : 'النظام',
      'تسجيل مصروف',
      `تسجيل مصروف ${category} بقيمة ${final_amount} ج.م (${final_payment_method})`,
      'Expenses',
      final_branch_id
    );

    return result.rows[0];
  });

  return expense;
}

async function updateExpense(id, body, user, req) {
  const expenseId = parsePositiveInt(id, 'id');
  const { category, amount, expense_date, notes, payment_method } = body || {};

  const existingRes = await db.query('SELECT * FROM expenses WHERE id = $1 AND is_deleted IS NOT TRUE', [expenseId]);
  if (existingRes.rows.length === 0) {
    const err = new Error('المصروف غير موجود');
    err.statusCode = 404;
    throw err;
  }
  const existing = existingRes.rows[0];

  // Role and ownership permissions
  if (user && user.role !== 'admin') {
    if (Number(existing.branch_id) !== Number(user.branch_id)) {
      const err = new Error('غير مصرح لك بتعديل مصروف في فرع آخر');
      err.statusCode = 403;
      throw err;
    }
    if (existing.created_by && Number(existing.created_by) !== Number(user.id)) {
      const err = new Error('غير مصرح لك بتعديل مصروف مسجل بواسطة مستخدم آخر');
      err.statusCode = 403;
      throw err;
    }
  }

  let finalAmount = existing.amount;
  if (amount !== undefined && amount !== '') {
    finalAmount = Number(amount);
    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      const err = new Error('مبلغ المصروف يجب أن يكون أكبر من صفر');
      err.statusCode = 400;
      throw err;
    }
  }

  const finalCategory = category || existing.category;
  const finalPaymentMethod = payment_method && ['cash', 'card', 'bank_transfer', 'wallet'].includes(payment_method)
    ? payment_method
    : existing.payment_method || 'cash';
  const finalExpenseDate = expense_date || existing.expense_date;
  const finalNotes = notes !== undefined ? (notes || null) : existing.notes;

  const updated = await db.transaction(async (tx) => {
    const res = await tx.query(`
      UPDATE expenses
      SET amount = $1,
          category = $2,
          payment_method = $3,
          expense_date = $4,
          notes = $5,
          updated_by = $6,
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      finalAmount,
      finalCategory,
      finalPaymentMethod,
      finalExpenseDate,
      finalNotes,
      user ? user.id : null,
      expenseId,
    ]);

    // If bonus, update corresponding employee_transactions bonus if linked
    if (existing.offline_uuid) {
      const marker = `[EXP-${existing.offline_uuid}]`;
      const cleanUpdateNotes = (finalNotes || '').replace(/\s*\[EXP-[^\]]+\]\s*/g, '').trim() || null;
      await tx.query(`
        UPDATE employee_transactions
        SET amount = $1, transaction_date = $2, notes = $3
        WHERE (offline_uuid = $4 OR notes LIKE $5) AND type = 'bonus'
      `, [finalAmount, finalExpenseDate, cleanUpdateNotes, existing.offline_uuid, `%${marker}%`]);
    }

    await queueSyncOperation(tx, req, 'expense', 'upsert', res.rows[0].id, res.rows[0].branch_id, res.rows[0]);

    await logActivity(
      user ? user.id : null,
      user ? user.username : 'النظام',
      'تعديل مصروف',
      `تعديل مصروف #${expenseId} بقيمة ${finalAmount} ج.م (${finalCategory})`,
      'Expenses',
      res.rows[0].branch_id
    );

    return res.rows[0];
  });

  return updated;
}

async function deleteExpense(id, user, req) {
  const expenseId = parsePositiveInt(id, 'id');

  const existingRes = await db.query('SELECT * FROM expenses WHERE id = $1 AND is_deleted IS NOT TRUE', [expenseId]);
  if (existingRes.rows.length === 0) {
    const err = new Error('المصروف غير موجود');
    err.statusCode = 404;
    throw err;
  }
  const existing = existingRes.rows[0];

  // Role and ownership permissions
  if (user && user.role !== 'admin') {
    if (Number(existing.branch_id) !== Number(user.branch_id)) {
      const err = new Error('غير مصرح لك بحذف مصروف في فرع آخر');
      err.statusCode = 403;
      throw err;
    }
    if (existing.created_by && Number(existing.created_by) !== Number(user.id)) {
      const err = new Error('غير مصرح لك بحذف مصروف مسجل بواسطة مستخدم آخر');
      err.statusCode = 403;
      throw err;
    }
  }

  const deleted = await db.transaction(async (tx) => {
    const res = await tx.query(`
      UPDATE expenses
      SET is_deleted = TRUE,
          deleted_by = $1,
          deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [user ? user.id : null, expenseId]);

    // If bonus, delete corresponding bonus in employee_transactions
    if (existing.offline_uuid) {
      const marker = `[EXP-${existing.offline_uuid}]`;
      await tx.query(`
        DELETE FROM employee_transactions
        WHERE (offline_uuid = $1 OR notes LIKE $2) AND type = 'bonus'
      `, [existing.offline_uuid, `%${marker}%`]);
    }

    await queueSyncOperation(tx, req, 'expense', 'upsert', res.rows[0].id, res.rows[0].branch_id, {
      ...res.rows[0],
      is_deleted: true,
    });

    await logActivity(
      user ? user.id : null,
      user ? user.username : 'النظام',
      'حذف مصروف',
      `حذف مصروف #${expenseId} بقيمة ${existing.amount} ج.م (${existing.category})`,
      'Expenses',
      existing.branch_id
    );

    return res.rows[0];
  });

  return deleted;
}

async function getWornProductsSummary(query = {}, user = null) {
  const params = [];
  const where = [];

  if (isBranchScopedUser(user)) {
    params.push(user.branch_id);
    where.push(`wp.branch_id = $${params.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`wp.branch_id = $${params.length}`);
  }

  if (query.product_type && query.product_type !== 'all') {
    params.push(query.product_type);
    where.push(`wp.product_type = $${params.length}`);
  }

  if (query.status && query.status !== 'all') {
    params.push(query.status);
    where.push(`wp.status = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(`
    SELECT
      COUNT(*)::int as records,
      COALESCE(SUM(quantity), 0)::int as quantity,
      COALESCE(SUM(estimated_loss), 0) as estimated_loss,
      COALESCE(SUM(quantity) FILTER (WHERE occurred_at >= date_trunc('month', ${CAIRO_DATE_SQL})::date), 0)::int as month_quantity
    FROM worn_products wp
    ${whereClause}
  `, params);

  return {
    records: Number(rows[0]?.records || 0),
    quantity: Number(rows[0]?.quantity || 0),
    estimated_loss: Number(rows[0]?.estimated_loss || 0),
    month_quantity: Number(rows[0]?.month_quantity || 0),
  };
}

async function listWornProducts(query = {}, user = null) {
  const pagination = parsePagination(query, 50, 200, true);
  const params = [];
  const where = [];

  if (isBranchScopedUser(user)) {
    params.push(user.branch_id);
    where.push(`wp.branch_id = $${params.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`wp.branch_id = $${params.length}`);
  }

  if (query.product_type && query.product_type !== 'all') {
    params.push(query.product_type);
    where.push(`wp.product_type = $${params.length}`);
  }

  if (query.status && query.status !== 'all') {
    params.push(query.status);
    where.push(`wp.status = $${params.length}`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(
      COALESCE(i.name, ri.name, '') ILIKE $${params.length}
      OR COALESCE(i.barcode, ri.barcode, '') ILIKE $${params.length}
      OR COALESCE(wp.reason, '') ILIKE $${params.length}
      OR COALESCE(wp.notes, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  let selectQuery = `
    SELECT wp.*,
           b.name as branch_name,
           u.username as reported_by_name,
           COALESCE(i.name, ri.name) as product_name,
           COALESCE(i.barcode, ri.barcode) as product_barcode,
           COALESCE(i.category, ri.category) as product_category,
           COALESCE(i.color, ri.color) as product_color,
           COALESCE(i.size_cut, ri.size_cut) as product_size
    FROM worn_products wp
    LEFT JOIN branches b ON wp.branch_id = b.id
    LEFT JOIN users u ON wp.reported_by = u.id
    LEFT JOIN inventory i ON wp.inventory_id = i.id
    LEFT JOIN rental_inventory ri ON wp.rental_inventory_id = ri.id
    ${whereClause}
    ORDER BY wp.occurred_at DESC, wp.id DESC
  `;

  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM worn_products wp
    LEFT JOIN inventory i ON wp.inventory_id = i.id
    LEFT JOIN rental_inventory ri ON wp.rental_inventory_id = ri.id
    ${whereClause}
  `;

  const queryParams = [...params];
  if (pagination.enabled) {
    selectQuery = appendPagination(selectQuery, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(selectQuery, queryParams),
      db.query(countQuery, params),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
  }

  const { rows } = await db.query(selectQuery, queryParams);
  return rows;
}

async function createWornProduct(body, user) {
  let {
    product_type,
    inventory_id,
    rental_inventory_id,
    branch_id,
    quantity,
    condition,
    reason,
    estimated_loss,
    notes,
    occurred_at,
    deduct_stock = true,
  } = body || {};

  product_type = product_type === 'rental' ? 'rental' : 'sales';
  const qty = parsePositiveInt(quantity, 'quantity');
  const finalBranchId = user && !hasInventoryAdminAccess(user) ? user.branch_id : parsePositiveInt(branch_id, 'branch_id');
  const stockTable = product_type === 'rental' ? 'rental_inventory_branches' : 'inventory_branches';
  const stockIdColumn = product_type === 'rental' ? 'rental_inventory_id' : 'inventory_id';
  const productId = parsePositiveInt(product_type === 'rental' ? rental_inventory_id : inventory_id, stockIdColumn);
  const finalInventoryId = product_type === 'sales' ? productId : null;
  const finalRentalInventoryId = product_type === 'rental' ? productId : null;
  const shouldDeductStock = deduct_stock !== false;

  const wornProduct = await db.transaction(async (tx) => {
    if (shouldDeductStock) {
      const stockRes = await tx.query(
        `SELECT stock_level FROM ${stockTable} WHERE ${stockIdColumn} = $1 AND branch_id = $2 FOR UPDATE`,
        [productId, finalBranchId]
      );
      const available = stockRes.rows.length ? Number(stockRes.rows[0].stock_level || 0) : 0;
      if (available < qty) {
        const err = new Error('الكمية المطلوبة أكبر من المتاح في هذا الفرع');
        err.statusCode = 400;
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }
      await tx.query(
        `UPDATE ${stockTable} SET stock_level = stock_level - $1 WHERE ${stockIdColumn} = $2 AND branch_id = $3`,
        [qty, productId, finalBranchId]
      );
      if (product_type === 'sales') {
        const totalStockRes = await tx.query('SELECT COALESCE(SUM(stock_level), 0) as total FROM inventory_branches WHERE inventory_id = $1', [productId]);
        await tx.query('UPDATE inventory SET stock_level = $1 WHERE id = $2', [Number(totalStockRes.rows[0]?.total || 0), productId]);
      }
    }

    const result = await tx.query(
      `INSERT INTO worn_products
        (product_type, inventory_id, rental_inventory_id, branch_id, quantity, condition, reason, estimated_loss, notes, reported_by, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, ${CAIRO_DATE_SQL}))
       RETURNING *`,
      [
        product_type,
        finalInventoryId,
        finalRentalInventoryId,
        finalBranchId,
        qty,
        condition || 'worn',
        reason || null,
        estimated_loss === '' || estimated_loss === undefined ? 0 : estimated_loss,
        notes || null,
        user ? user.id : null,
        occurred_at || null,
      ]
    );
    return result.rows[0];
  });

  return wornProduct;
}

async function updateWornProduct(id, body, user) {
  const { status, notes } = body || {};
  const params = [status || null, notes || null, id];
  let branchFilter = '';
  if (isBranchScopedUser(user)) {
    params.push(user.branch_id);
    branchFilter = ` AND branch_id = $${params.length}`;
  }

  const { rows } = await db.query(
    `UPDATE worn_products
     SET status = COALESCE($1, status), notes = COALESCE($2, notes)
     WHERE id = $3${branchFilter}
     RETURNING *`,
    params
  );

  if (rows.length === 0) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
}

module.exports = {
  getExpensesSummary,
  listExpenses,
  listExpenseCashiers,
  createExpense,
  updateExpense,
  deleteExpense,
  getWornProductsSummary,
  listWornProducts,
  createWornProduct,
  updateWornProduct,
};
