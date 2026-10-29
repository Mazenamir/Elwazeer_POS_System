const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const { hasInventoryAdminAccess, isBranchScopedUser } = require('../../../shared/constants/permissions');
const { likePattern, newUuid, getInitialsFromName } = require('../../../shared/utils/string');
const { clampInt, parsePositiveInt } = require('../../../shared/utils/numbers');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { adjustInventoryStock } = require('../inventory/inventory.helpers');

async function getSupplierOptions(query = {}) {
  const params = [];
  const where = [];

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(s.name ILIKE $${params.length} OR s.phone ILIKE $${params.length} OR s.code ILIKE $${params.length})`);
  }
  if (query.include_archived !== 'true') {
    where.push('COALESCE(s.is_active, TRUE) = TRUE');
  }

  const limit = clampInt(query.limit, 50, 10, 100);
  params.push(limit);
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT id, name, code, gender_category
     FROM suppliers s
     ${whereClause}
     ORDER BY name, id
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function listSuppliers(query = {}, user = null, req = null) {
  const isInventoryAdmin = hasInventoryAdminAccess(user);
  const pagination = parsePagination(req || { query }, 50, 200, true);

  const params = [];
  const where = [];

  // Legacy combined search
  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(s.name ILIKE $${params.length} OR s.phone ILIKE $${params.length} OR s.code ILIKE $${params.length})`);
  }

  // Individual field filters
  if (query.code) {
    params.push(likePattern(query.code));
    where.push(`s.code ILIKE $${params.length}`);
  }
  if (query.name) {
    params.push(likePattern(query.name));
    where.push(`s.name ILIKE $${params.length}`);
  }
  if (query.phone) {
    params.push(likePattern(query.phone));
    where.push(`(s.phone ILIKE $${params.length} OR s.extra_phone ILIKE $${params.length})`);
  }
  if (query.gender_category && query.gender_category !== 'all') {
    const gc = String(query.gender_category).trim();
    if (gc === 'رجالي' || gc === 'men') {
      where.push(`s.gender_category IN ('رجالي', 'men')`);
    } else if (gc === 'حريمي' || gc === 'women') {
      where.push(`s.gender_category IN ('حريمي', 'women')`);
    } else if (gc === 'كلاهما' || gc === 'مشترك' || gc === 'both') {
      where.push(`s.gender_category IN ('كلاهما', 'مشترك', 'both')`);
    } else {
      params.push(gc);
      where.push(`s.gender_category = $${params.length}`);
    }
  }
  if (query.include_archived !== 'true') {
    where.push('COALESCE(s.is_active, TRUE) = TRUE');
  }

  const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const SORT_MAP = {
    latest: 's.created_at DESC, s.id DESC',
    created_desc: 's.created_at DESC, s.id DESC',
    'الأحدث أولاً': 's.created_at DESC, s.id DESC',
    'الأحدث': 's.created_at DESC, s.id DESC',
    oldest: 's.created_at ASC, s.id ASC',
    created_asc: 's.created_at ASC, s.id ASC',
    'الأقدم أولاً': 's.created_at ASC, s.id ASC',
    'الأقدم': 's.created_at ASC, s.id ASC',
    balance_desc: 'COALESCE(s.balance, 0) DESC, s.id DESC',
    balance: 'COALESCE(s.balance, 0) DESC, s.id DESC',
    'الأعلى رصيداً': 'COALESCE(s.balance, 0) DESC, s.id DESC',
    'الأعلى رصيداً / مديونية': 'COALESCE(s.balance, 0) DESC, s.id DESC',
    purchases_desc: 'COALESCE(s.total_purchases, 0) DESC, s.id DESC',
    purchases: 'COALESCE(s.total_purchases, 0) DESC, s.id DESC',
    'الأكثر مشتريات': 'COALESCE(s.total_purchases, 0) DESC, s.id DESC',
    name_asc: 's.name ASC, s.id ASC',
    name: 's.name ASC, s.id ASC',
    'الاسم (أ - ي)': 's.name ASC, s.id ASC',
    'الاسم': 's.name ASC, s.id ASC',
  };
  const rawSort = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const sortKey = (typeof rawSort === 'string' ? rawSort : 'latest').toLowerCase().trim();
  const orderByClause = SORT_MAP[sortKey] || 's.created_at DESC, s.id DESC';

  let selectQuery = isInventoryAdmin
    ? `SELECT s.*,
         COALESCE((
           SELECT COUNT(DISTINCT CASE
             WHEN st.transaction_type = 'purchase' AND st.purchase_batch_id IS NOT NULL
               THEN 'purchase:' || st.purchase_batch_id::text
             ELSE 'transaction:' || st.id::text
           END)::int
           FROM supplier_transactions st
           WHERE st.supplier_id = s.id
         ), 0) AS transaction_count,
         COALESCE((SELECT MAX(st.id) FROM supplier_transactions st WHERE st.supplier_id = s.id), 0) AS latest_transaction_id
       FROM suppliers s${whereClause} ORDER BY ${orderByClause}`
    : `SELECT s.* FROM suppliers s${whereClause} ORDER BY ${orderByClause}`;

  const countQuery = `SELECT 
    COUNT(*)::int as total, 
    COALESCE(SUM(s.balance), 0)::numeric as total_balance,
    COALESCE(SUM(s.balance) FILTER (WHERE s.gender_category IN ('رجالي', 'men')), 0)::numeric as total_men_balance,
    COALESCE(SUM(s.balance) FILTER (WHERE s.gender_category IN ('حريمي', 'women')), 0)::numeric as total_women_balance,
    COALESCE(SUM(s.balance) FILTER (WHERE s.gender_category IN ('كلاهما', 'مشترك', 'both')), 0)::numeric as total_both_balance
  FROM suppliers s${whereClause}`;

  const queryParams = [...params];

  if (pagination.enabled) {
    selectQuery = appendPagination(selectQuery, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(selectQuery, queryParams),
      db.query(countQuery, params),
    ]);

    const payload = paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
    payload.total_balance = countRes.rows[0]?.total_balance || 0;
    payload.total_men_balance = countRes.rows[0]?.total_men_balance || 0;
    payload.total_women_balance = countRes.rows[0]?.total_women_balance || 0;
    payload.total_both_balance = countRes.rows[0]?.total_both_balance || 0;
    return payload;
  }

  const [dataRes, countRes] = await Promise.all([
    db.query(selectQuery, queryParams),
    db.query(countQuery, params),
  ]);

  return {
    data: dataRes.rows,
    total_balance: countRes.rows[0]?.total_balance || 0,
    total_men_balance: countRes.rows[0]?.total_men_balance || 0,
    total_women_balance: countRes.rows[0]?.total_women_balance || 0,
    total_both_balance: countRes.rows[0]?.total_both_balance || 0,
  };
}

async function createSupplier(payload) {
  const {
    name, code, contact_person, phone, extra_phone, email,
    address, city, country, supplier_type, company_name, tax_id,
    payment_method, payment_terms, currency,
    moq, lead_time, rating, notes, status, logo_url, supply_type, gender_category,
    created_at,
  } = payload || {};

  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) {
    const err = new Error('Supplier name is required');
    err.statusCode = 400;
    throw err;
  }
  const initials = getInitialsFromName(normalizedName);

  if (code && String(code).trim() !== '') {
    const existing = await db.query('SELECT id FROM suppliers WHERE code = $1', [String(code).trim()]);
    if (existing.rows.length > 0) {
      const err = new Error('كود المورد موجود بالفعل، يرجى اختيار كود آخر');
      err.statusCode = 400;
      throw err;
    }
  }

  let createdAtVal = null;
  if (created_at) {
    if (typeof created_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(created_at.trim())) {
      createdAtVal = `${created_at.trim()}T12:00:00.000Z`;
    } else {
      const parsed = new Date(created_at);
      if (!isNaN(parsed.getTime())) {
        createdAtVal = parsed.toISOString();
      }
    }
  }

  let normalizedGenderCat = 'رجالي';
  if (gender_category) {
    const gc = String(gender_category).trim();
    if (gc === 'حريمي' || gc === 'women') normalizedGenderCat = 'حريمي';
    else if (gc === 'كلاهما' || gc === 'مشترك' || gc === 'both') normalizedGenderCat = 'كلاهما';
    else normalizedGenderCat = 'رجالي';
  }

  const { rows } = await db.query(
    `INSERT INTO suppliers (
      name, initials, code, contact_person, phone, extra_phone, email, 
      address, city, country, supplier_type, company_name, tax_id,
      payment_method, payment_terms, currency,
      moq, lead_time, rating, notes, status, logo_url, supply_type, gender_category,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, COALESCE($25::timestamptz, CURRENT_TIMESTAMP)) RETURNING *`,
    [
      normalizedName, initials, code, contact_person, phone, extra_phone, email,
      address, city, country, supplier_type, company_name, tax_id,
      payment_method || 'نقدي', payment_terms || 0, currency || 'ج.م',
      moq || 0, lead_time || 0, rating || 5, notes, status || 'active', logo_url, supply_type, normalizedGenderCat,
      createdAtVal,
    ]
  );
  return rows[0];
}

async function updateSupplier(id, payload) {
  const {
    name, code, contact_person, phone, extra_phone, email,
    address, city, country, supplier_type, company_name, tax_id,
    payment_method, payment_terms, currency,
    moq, lead_time, rating, notes, status, logo_url, supply_type, gender_category,
  } = payload || {};

  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) {
    const err = new Error('Supplier name is required');
    err.statusCode = 400;
    throw err;
  }
  const initials = getInitialsFromName(normalizedName);

  if (code && String(code).trim() !== '') {
    const existing = await db.query('SELECT id FROM suppliers WHERE code = $1 AND id != $2', [String(code).trim(), id]);
    if (existing.rows.length > 0) {
      const err = new Error('كود المورد موجود بالفعل، يرجى اختيار كود آخر');
      err.statusCode = 400;
      throw err;
    }
  }

  let normalizedGenderCat = null;
  if (gender_category !== undefined && gender_category !== null) {
    const gc = String(gender_category).trim();
    if (gc === 'حريمي' || gc === 'women') normalizedGenderCat = 'حريمي';
    else if (gc === 'كلاهما' || gc === 'مشترك' || gc === 'both') normalizedGenderCat = 'كلاهما';
    else normalizedGenderCat = 'رجالي';
  }

  const { rows } = await db.query(
    `UPDATE suppliers SET 
      name = $1, initials = $2, code = $3, contact_person = $4, phone = $5, 
      extra_phone = $6, email = $7, address = $8, city = $9, country = $10, 
      supplier_type = $11, company_name = $12, tax_id = $13, 
      payment_method = $14, payment_terms = $15, currency = $16, moq = $17, 
      lead_time = $18, rating = $19, notes = $20, status = $21, logo_url = $22, supply_type = $23,
      gender_category = COALESCE($24, gender_category)
    WHERE id = $25 RETURNING *`,
    [
      normalizedName, initials, code, contact_person, phone,
      extra_phone, email, address, city, country,
      supplier_type, company_name, tax_id,
      payment_method, payment_terms, currency, moq,
      lead_time, rating, notes, status, logo_url, supply_type,
      normalizedGenderCat, id,
    ]
  );

  if (rows.length === 0) {
    const err = new Error('Supplier not found');
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
}

async function deleteSupplier(id) {
  await db.transaction(async (tx) => {
    // Soft delete / archive supplier to preserve accounting history (supply_records, supplier_transactions)
    await tx.query('UPDATE inventory SET preferred_supplier_id = NULL WHERE preferred_supplier_id = $1', [id]);
    await tx.query("UPDATE suppliers SET is_active = FALSE, status = 'inactive' WHERE id = $1", [id]);
  });
  return { success: true };
}

async function listSupplyRecords(req, user = null) {
  const pagination = parsePagination(req, 50, 200, true);
  const conditions = [];
  const params = [];

  if (isBranchScopedUser(user)) {
    conditions.push(`sr.branch_id = $${params.length + 1}`);
    params.push(user.branch_id);
  } else if (req?.query?.branch_id && req.query.branch_id !== 'all') {
    conditions.push(`sr.branch_id = $${params.length + 1}`);
    params.push(Number(req.query.branch_id));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `
    SELECT sr.*, s.name as supplier_name, i.name as inventory_name, i.category as inventory_category, b.name as branch_name
    FROM supply_records sr
    JOIN suppliers s ON sr.supplier_id = s.id
    JOIN inventory i ON sr.inventory_id = i.id
    LEFT JOIN branches b ON sr.branch_id = b.id
    ${whereClause}
    ORDER BY sr.supply_date DESC
  `;

  if (pagination.enabled) {
    query = appendPagination(query, params, pagination);
    const countQuery = `SELECT COUNT(*)::int as total FROM supply_records sr ${whereClause}`;
    const countParams = conditions.length > 0 ? [params[0]] : [];
    const [dataRes, countRes] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
  }

  const { rows } = await db.query(query, params);
  return rows;
}

async function createSupplyRecord(payload, user) {
  let { supplier_id, inventory_id, quantity, cost_price, notes, branch_id, size, color } = payload;
  if (isBranchScopedUser(user)) {
    branch_id = user.branch_id;
  }
  const b_id = branch_id || 1; // Default to main warehouse
  const supplyQty = parsePositiveInt(quantity, 'quantity');

  const supplyRecord = await db.transaction(async (tx) => {
    const batchId = newUuid();
    const { rows } = await tx.query(
      'INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [supplier_id, inventory_id, supplyQty, cost_price, notes, b_id, batchId]
    );

    // Add stock across sizes, branch, and global canonical level
    await adjustInventoryStock(tx, {
      inventoryId: inventory_id,
      branchId: b_id,
      quantityDelta: supplyQty,
      size: size || null,
      color: color || null,
    });

    // Record the purchase transaction for the supplier
    const total_cost = supplyQty * cost_price;
    await tx.query(
      'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, $5)',
      [supplier_id, 'purchase', total_cost, 'فاتورة مشتريات بضاعة (إذن إضافة)', batchId]
    );

    // Update supplier balance, purchase count and last supply date
    await tx.query(
      `UPDATE suppliers SET total_purchases = total_purchases + $1, balance = balance - $1, purchase_count = purchase_count + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
      [total_cost, supplier_id]
    );

    return rows[0];
  });

  return supplyRecord;
}

async function bulkRestock(payload, user) {
  let { items, supplier_id, cost_price, branch_id } = payload;
  if (isBranchScopedUser(user)) {
    branch_id = user.branch_id;
  }
  const b_id = parseInt(branch_id, 10) || 1;
  const cost = parseFloat(cost_price) || 0;

  const result = await db.transaction(async (tx) => {
    const batchId = newUuid();
    let totalQty = 0;

    for (const item of items || []) {
      const qty = parseInt(item.quantity, 10) || 0;
      if (qty <= 0) continue;
      totalQty += qty;

      // Insert supply record
      await tx.query(
        'INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, branch_id, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [supplier_id, item.inventory_id, qty, cost, b_id, 'توريد كميات (مجموعة)', batchId]
      );

      // Update branch, sizes, and global stock
      await adjustInventoryStock(tx, {
        inventoryId: item.inventory_id,
        branchId: b_id,
        quantityDelta: qty,
        size: item.size || null,
        color: item.color || null,
      });
    }

    const total_cost = totalQty * cost;

    if (totalQty > 0) {
      // Record supplier transaction
      await tx.query(
        'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, $5)',
        [supplier_id, 'purchase', total_cost, `فاتورة مشتريات بضاعة (إذن إضافة مجموعة) - عدد ${totalQty} قطعة`, batchId]
      );

      // Update supplier stats
      await tx.query(
        `UPDATE suppliers SET total_purchases = total_purchases + $1, balance = balance - $1, purchase_count = purchase_count + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
        [total_cost, supplier_id]
      );
    }

    return { success: true, totalQty, total_cost };
  });

  return result;
}

async function createSupplierTransaction(payload, user = null) {
  const transaction_type = payload.transaction_type || payload.type || 'payment';
  const { supplier_id, amount, notes } = payload;
  const safeAmount = Number(amount);
  if (!supplier_id || !Number.isFinite(safeAmount) || safeAmount <= 0) {
    const err = new Error('مبلغ الدفعة يجب أن يكون أكبر من صفر');
    err.statusCode = 400;
    throw err;
  }

  let branch_id = payload.branch_id ? Number(payload.branch_id) : (user && user.branch_id ? Number(user.branch_id) : null);
  if (user && user.role !== 'admin' && user.branch_id) {
    branch_id = Number(user.branch_id);
  }
  const payment_method = payload.payment_method || 'cash';
  let paid_from_drawer;
  if (payload.paid_from_drawer !== undefined && payload.paid_from_drawer !== null) {
    if (typeof payload.paid_from_drawer === 'string') {
      paid_from_drawer = payload.paid_from_drawer.toLowerCase() === 'true' || payload.paid_from_drawer === '1';
    } else {
      paid_from_drawer = Boolean(payload.paid_from_drawer);
    }
  } else {
    paid_from_drawer = ['cash', 'نقدي', 'كاش'].includes(payment_method.toLowerCase());
  }

  await db.transaction(async (tx) => {
    await tx.query(
      'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, branch_id, payment_method, paid_from_drawer) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [supplier_id, transaction_type, safeAmount, notes || null, branch_id, payment_method, paid_from_drawer]
    );

    if (transaction_type === 'purchase') {
      await tx.query(
        `UPDATE suppliers SET total_purchases = total_purchases + $1, balance = balance - $1, purchase_count = purchase_count + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
        [safeAmount, supplier_id]
      );
    } else if (transaction_type === 'payment') {
      await tx.query(
        'UPDATE suppliers SET total_paid = total_paid + $1, balance = balance + $1 WHERE id = $2',
        [safeAmount, supplier_id]
      );
    }
  });

  return { success: true };
}

async function processSupplierReturn(payload) {
  const { supplier_id, purchase_transaction_id, items, total_amount, notes } = payload;

  if (!supplier_id || !items || items.length === 0 || !total_amount) {
    const err = new Error('بيانات غير كاملة');
    err.statusCode = 400;
    throw err;
  }

  await db.transaction(async (tx) => {
    // 1. Record return transaction in supplier_transactions
    const returnTransactionRes = await tx.query(
      'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, (SELECT purchase_batch_id FROM supplier_transactions WHERE id = $5)) RETURNING id',
      [supplier_id, 'return', total_amount, notes || 'مرتجع بضاعة', purchase_transaction_id]
    );
    const returnTransactionId = returnTransactionRes.rows[0].id;

    // 2. Update supplier ledger (return deducts purchases and increases balance)
    await tx.query(
      'UPDATE suppliers SET total_purchases = total_purchases - $1, balance = balance + $1 WHERE id = $2',
      [total_amount, supplier_id]
    );

    // 3. Deduct stock for each item
    for (const item of items) {
      // Deduct from inventory_branches
      const checkRes = await tx.query(
        'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
        [item.inventory_id, item.branch_id]
      );
      const currentStock = checkRes.rows[0]?.stock_level || 0;
      if (currentStock < item.quantity) {
        const err = new Error(`المخزون الحالي للمنتج غير كافي. المتاح: ${currentStock} قطعة، المطلوب: ${item.quantity} قطعة`);
        err.statusCode = 400;
        throw err;
      }

      // Deduct from branch, sizes, and global inventory
      await adjustInventoryStock(tx, {
        inventoryId: item.inventory_id,
        branchId: item.branch_id,
        quantityDelta: -item.quantity,
        size: item.size || null,
        color: item.color || null,
      });

      // 4. Record negative quantity in supply_records with unique return transaction tag
      const uniqueNote = `مرتجع [RTN-${returnTransactionId}] - ${notes || ''}`;
      await tx.query(
        'INSERT INTO supply_records (supplier_id, inventory_id, branch_id, quantity, cost_price, supply_date, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT purchase_batch_id FROM supplier_transactions WHERE id = $8))',
        [supplier_id, item.inventory_id, item.branch_id, -item.quantity, item.cost_price, new Date(), uniqueNote, purchase_transaction_id]
      );
    }
  });

  return { success: true };
}

function buildSupplierStatementTimeline(supplier, supplyRecords, transactions) {
  const items = [];

  for (const sr of supplyRecords) {
    const qty = Number(sr.quantity || 0);
    const cost = Number(sr.cost_price || 0);
    const isReturn = qty < 0;
    const absQty = Math.abs(qty);
    const totalCost = Math.round(absQty * cost * 100) / 100;
    const dateStr = sr.supply_date
      ? (typeof sr.supply_date === 'string' ? sr.supply_date.slice(0, 10) : new Date(sr.supply_date).toISOString().slice(0, 10))
      : '';

    if (isReturn) {
      items.push({
        id: `sr-${sr.id}`,
        raw_id: sr.id,
        supplier_id: supplier.id,
        type: 'return',
        transaction_type: 'return',
        amount: totalCost,
        date: dateStr,
        created_at: sr.supply_date,
        reference_no: sr.purchase_batch_id ? `مرتجع-${String(sr.purchase_batch_id).slice(0, 8)}` : `مرتجع #${sr.id}`,
        description: `مرتجع: ${sr.inventory_name || sr.notes || 'صنف مرتجع'}`,
        quantity: absQty,
        price: cost,
        purchases: 0,
        returns: totalCost,
        payments: 0,
        movement: -totalCost,
        notes: sr.notes || '',
        branch_name: sr.branch_name || '',
      });
    } else {
      items.push({
        id: `sr-${sr.id}`,
        raw_id: sr.id,
        supplier_id: supplier.id,
        type: 'supply',
        transaction_type: 'purchase',
        amount: totalCost,
        date: dateStr,
        created_at: sr.supply_date,
        reference_no: sr.purchase_batch_id ? `شحنة-${String(sr.purchase_batch_id).slice(0, 8)}` : `توريد #${sr.id}`,
        description: sr.inventory_name || sr.notes || 'توريد بضاعة',
        quantity: absQty,
        price: cost,
        purchases: totalCost,
        returns: 0,
        payments: 0,
        movement: totalCost,
        notes: sr.notes || '',
        branch_name: sr.branch_name || '',
      });
    }
  }

  for (const st of transactions) {
    const amt = Number(st.amount || 0);
    const dateStr = st.transaction_date
      ? (typeof st.transaction_date === 'string' ? st.transaction_date.slice(0, 10) : new Date(st.transaction_date).toISOString().slice(0, 10))
      : '';
    const isPayment = st.transaction_type === 'payment';
    const isReturn = st.transaction_type === 'return';
    const isPurchase = st.transaction_type === 'purchase';

    // If purchase has purchase_batch_id, supply_records already provides the itemized movement
    if (isPurchase && st.purchase_batch_id) {
      continue;
    }
    // If return has purchase_batch_id, supply_records already has the negative quantity item
    if (isReturn && st.purchase_batch_id) {
      continue;
    }

    if (isPayment) {
      items.push({
        id: `st-${st.id}`,
        raw_id: st.id,
        supplier_id: supplier.id,
        type: 'payment',
        transaction_type: 'payment',
        amount: amt,
        date: dateStr,
        created_at: st.transaction_date,
        reference_no: `سداد #${st.id}`,
        description: st.notes || (st.paid_from_drawer ? 'سداد دفعة نقدية من الدرج' : 'سداد دفعة للمورد'),
        quantity: null,
        price: null,
        purchases: 0,
        returns: 0,
        payments: amt,
        movement: -amt,
        notes: st.notes || '',
        branch_name: st.branch_name || '',
      });
    } else if (isReturn) {
      items.push({
        id: `st-${st.id}`,
        raw_id: st.id,
        supplier_id: supplier.id,
        type: 'return',
        transaction_type: 'return',
        amount: amt,
        date: dateStr,
        created_at: st.transaction_date,
        reference_no: `مرتجع #${st.id}`,
        description: st.notes || 'تسوية مرتجع بضاعة',
        quantity: null,
        price: null,
        purchases: 0,
        returns: amt,
        payments: 0,
        movement: -amt,
        notes: st.notes || '',
        branch_name: st.branch_name || '',
      });
    } else if (isPurchase) {
      items.push({
        id: `st-${st.id}`,
        raw_id: st.id,
        supplier_id: supplier.id,
        type: 'supply',
        transaction_type: 'purchase',
        amount: amt,
        date: dateStr,
        created_at: st.transaction_date,
        reference_no: `فاتورة #${st.id}`,
        description: st.notes || 'مشتريات بضاعة',
        quantity: null,
        price: null,
        purchases: amt,
        returns: 0,
        payments: 0,
        movement: amt,
        notes: st.notes || '',
        branch_name: st.branch_name || '',
      });
    }
  }

  // Sort timeline chronologically (oldest to newest)
  items.sort((a, b) => {
    const timeA = new Date(a.created_at || a.date).getTime() || 0;
    const timeB = new Date(b.created_at || b.date).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a.id).localeCompare(String(b.id));
  });

  // Calculate rolling cumulative balance
  let running = 0;
  for (const item of items) {
    running = Math.round((running + item.movement) * 100) / 100;
    item.cumulative_balance = running;
    item.cumulative_balance_type = running > 0 ? 'دائن (له)' : (running < 0 ? 'مدين (عليه)' : 'خالص');
  }

  const totalPurchases = Math.round(items.reduce((s, it) => s + it.purchases, 0) * 100) / 100;
  const totalReturns = Math.round(items.reduce((s, it) => s + it.returns, 0) * 100) / 100;
  const totalPaid = Math.round(items.reduce((s, it) => s + it.payments, 0) * 100) / 100;
  const closingBalance = Math.round((totalPurchases - totalReturns - totalPaid) * 100) / 100;
  const closingBalanceType = closingBalance > 0 ? 'دائن (له)' : (closingBalance < 0 ? 'مدين (عليه)' : 'خالص');

  return {
    items,
    total_purchases: totalPurchases,
    total_returns: totalReturns,
    total_paid: totalPaid,
    balance: closingBalance,
    balance_type: closingBalanceType,
  };
}

async function getSupplierStatement(id, requestedLimit = null, query = {}, user = null) {
  const supplierRes = await db.query('SELECT * FROM suppliers WHERE id = $1', [id]);
  if (supplierRes.rows.length === 0) {
    const err = new Error('Supplier not found');
    err.statusCode = 404;
    throw err;
  }
  const supplier = supplierRes.rows[0];

  let branchId = null;
  if (user && user.role !== 'admin') {
    branchId = user.branch_id;
  } else if (query && query.branch_id && query.branch_id !== 'all') {
    branchId = Number(query.branch_id);
  }

  // Supply records
  const srParams = [id];
  let srBranchFilter = '';
  if (branchId) {
    srParams.push(branchId);
    srBranchFilter = `AND sr.branch_id = $${srParams.length}`;
  }
  const startDate = query ? (query.start_date || query.startDate || query.date_from || query.from || null) : null;
  const endDate = query ? (query.end_date || query.endDate || query.date_to || query.to || null) : null;
  let srDateFilter = '';
  if (startDate) {
    srParams.push(startDate);
    srDateFilter += ` AND sr.supply_date >= $${srParams.length}::date`;
  }
  if (endDate) {
    srParams.push(endDate);
    srDateFilter += ` AND sr.supply_date < ($${srParams.length}::date + INTERVAL '1 day')`;
  }

  const supplyRecordsRes = await db.query(`
    SELECT sr.id, sr.supplier_id, sr.inventory_id, sr.quantity, sr.supply_date,
           sr.cost_price, sr.notes, sr.branch_id, sr.purchase_batch_id,
           i.name as inventory_name, i.barcode as inventory_barcode,
           i.category as inventory_category, i.color as inventory_color,
           i.size_cut as inventory_size, i.gender as inventory_gender, i.price as inventory_price,
           b.name as branch_name,
           (sr.quantity * sr.cost_price) as total_cost
    FROM supply_records sr
    LEFT JOIN inventory i ON sr.inventory_id = i.id
    LEFT JOIN branches b ON sr.branch_id = b.id
    WHERE sr.supplier_id = $1
      ${srBranchFilter}
      ${srDateFilter}
    ORDER BY sr.supply_date ASC, sr.id ASC
  `, srParams);

  // Transactions
  const stParams = [id];
  let stBranchFilter = '';
  if (branchId) {
    stParams.push(branchId);
    stBranchFilter = user && user.role !== 'admin'
      ? `AND st.branch_id = $${stParams.length}`
      : `AND (st.branch_id = $${stParams.length} OR st.branch_id IS NULL)`;
  }
  let stDateFilter = '';
  if (startDate) {
    stParams.push(startDate);
    stDateFilter += ` AND st.transaction_date >= $${stParams.length}::date`;
  }
  if (endDate) {
    stParams.push(endDate);
    stDateFilter += ` AND st.transaction_date < ($${stParams.length}::date + INTERVAL '1 day')`;
  }

  const transactionsRes = await db.query(`
    SELECT st.id, st.supplier_id, st.transaction_type, st.amount, st.notes,
           st.transaction_date, st.purchase_batch_id, st.branch_id,
           st.payment_method, st.paid_from_drawer,
           b.name as branch_name
    FROM supplier_transactions st
    LEFT JOIN branches b ON st.branch_id = b.id
    WHERE st.supplier_id = $1
      ${stBranchFilter}
      ${stDateFilter}
    ORDER BY st.transaction_date ASC, st.id ASC
  `, stParams);

  const statement = buildSupplierStatementTimeline(supplier, supplyRecordsRes.rows, transactionsRes.rows);

  let finalPurchases = statement.total_purchases;
  let finalPaid = statement.total_paid;
  let finalBalance = statement.balance;

  const hasLegacyData = Number(supplier.total_purchases) > 0 || Number(supplier.total_paid) > 0 || Number(supplier.balance) !== 0;
  if (!startDate && !endDate && !branchId && statement.items.length === 0 && hasLegacyData) {
    finalPurchases = Number(supplier.total_purchases || 0);
    finalPaid = Number(supplier.total_paid || 0);
    finalBalance = (finalPurchases > 0 || finalPaid > 0)
      ? Math.round((finalPurchases - finalPaid) * 100) / 100
      : Math.round(-Number(supplier.balance || 0) * 100) / 100;
  }

  const parsedLimit = Number.parseInt(requestedLimit, 10);
  let finalItems = statement.items;
  if (Number.isInteger(parsedLimit) && parsedLimit > 0 && finalItems.length > parsedLimit) {
    // Keep most recent transactions if limited
    finalItems = finalItems.slice(-parsedLimit);
  }

  return {
    supplier: {
      ...supplier,
      balance: finalBalance,
      balance_type: finalBalance > 0 ? 'دائن (له)' : (finalBalance < 0 ? 'مدين (عليه)' : 'خالص'),
      total_purchases: finalPurchases,
      total_returns: statement.total_returns,
      total_paid: finalPaid,
    },
    transactions: finalItems,
    purchases: supplyRecordsRes.rows,
    summary: {
      total_purchases: finalPurchases,
      total_returns: statement.total_returns,
      total_paid: finalPaid,
      total_payments: finalPaid,
      balance: finalBalance,
      current_balance: finalBalance,
      balance_type: finalBalance > 0 ? 'دائن (له)' : (finalBalance < 0 ? 'مدين (عليه)' : 'خالص'),
    },
  };
}

async function getSuppliersLedger(query = {}, user = null, req = null) {
  // 1. Branch isolation
  let branchId = null;
  if (user && user.role !== 'admin') {
    branchId = user.branch_id;
  } else if (query.branch_id && query.branch_id !== 'all') {
    branchId = Number(query.branch_id);
  }

  // 2. Fetch suppliers
  const params = [];
  const where = [];

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(s.name ILIKE $${params.length} OR s.phone ILIKE $${params.length} OR s.code ILIKE $${params.length})`);
  }
  if (query.code) {
    params.push(likePattern(query.code));
    where.push(`s.code ILIKE $${params.length}`);
  }
  if (query.gender_category && query.gender_category !== 'all') {
    params.push(query.gender_category);
    where.push(`s.gender_category = $${params.length}`);
  }
  if (query.include_archived !== 'true') {
    where.push('COALESCE(s.is_active, TRUE) = TRUE');
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const suppliersRes = await db.query(
    `SELECT s.* FROM suppliers s ${whereClause} ORDER BY s.name ASC, s.id ASC`,
    params
  );
  const suppliers = suppliersRes.rows;
  if (suppliers.length === 0) {
    return {
      summary: {
        total_suppliers: 0,
        grand_total_purchases: 0,
        grand_total_returns: 0,
        grand_total_paid: 0,
        grand_total_balance: 0,
        grand_total_balance_type: 'خالص',
        branch_id: branchId,
      },
      suppliers: [],
    };
  }

  const supplierIds = suppliers.map(s => s.id);

  // 3. Fetch all supply records for these suppliers
  const srParams = [supplierIds];
  let srBranchFilter = '';
  if (branchId) {
    srParams.push(branchId);
    srBranchFilter = `AND sr.branch_id = $${srParams.length}`;
  }
  const startDate = query.start_date || query.startDate || query.date_from || query.from || null;
  const endDate = query.end_date || query.endDate || query.date_to || query.to || null;
  let srDateFilter = '';
  if (startDate) {
    srParams.push(startDate);
    srDateFilter += ` AND sr.supply_date >= $${srParams.length}::date`;
  }
  if (endDate) {
    srParams.push(endDate);
    srDateFilter += ` AND sr.supply_date < ($${srParams.length}::date + INTERVAL '1 day')`;
  }

  const supplyRecordsRes = await db.query(`
    SELECT sr.id, sr.supplier_id, sr.inventory_id, sr.quantity, sr.supply_date,
           sr.cost_price, sr.notes, sr.branch_id, sr.purchase_batch_id,
           i.name as inventory_name, i.barcode as inventory_barcode,
           i.category as inventory_category,
           b.name as branch_name,
           (sr.quantity * sr.cost_price) as total_cost
    FROM supply_records sr
    LEFT JOIN inventory i ON sr.inventory_id = i.id
    LEFT JOIN branches b ON sr.branch_id = b.id
    WHERE sr.supplier_id = ANY($1)
      ${srBranchFilter}
      ${srDateFilter}
    ORDER BY sr.supply_date ASC, sr.id ASC
  `, srParams);

  // 4. Fetch all transactions for these suppliers
  const stParams = [supplierIds];
  let stBranchFilter = '';
  if (branchId) {
    stParams.push(branchId);
    stBranchFilter = user && user.role !== 'admin'
      ? `AND st.branch_id = $${stParams.length}`
      : `AND (st.branch_id = $${stParams.length} OR st.branch_id IS NULL)`;
  }
  let stDateFilter = '';
  if (startDate) {
    stParams.push(startDate);
    stDateFilter += ` AND st.transaction_date >= $${stParams.length}::date`;
  }
  if (endDate) {
    stParams.push(endDate);
    stDateFilter += ` AND st.transaction_date < ($${stParams.length}::date + INTERVAL '1 day')`;
  }

  const transactionsRes = await db.query(`
    SELECT st.id, st.supplier_id, st.transaction_type, st.amount, st.notes,
           st.transaction_date, st.purchase_batch_id, st.branch_id,
           st.payment_method, st.paid_from_drawer,
           b.name as branch_name
    FROM supplier_transactions st
    LEFT JOIN branches b ON st.branch_id = b.id
    WHERE st.supplier_id = ANY($1)
      ${stBranchFilter}
      ${stDateFilter}
    ORDER BY st.transaction_date ASC, st.id ASC
  `, stParams);

  // 5. Group by supplier_id
  const srBySupplier = new Map();
  for (const sr of supplyRecordsRes.rows) {
    if (!srBySupplier.has(sr.supplier_id)) srBySupplier.set(sr.supplier_id, []);
    srBySupplier.get(sr.supplier_id).push(sr);
  }

  const stBySupplier = new Map();
  for (const st of transactionsRes.rows) {
    if (!stBySupplier.has(st.supplier_id)) stBySupplier.set(st.supplier_id, []);
    stBySupplier.get(st.supplier_id).push(st);
  }

  // 6. Build statement per supplier
  let grandTotalPurchases = 0;
  let grandTotalReturns = 0;
  let grandTotalPaid = 0;
  let grandTotalBalance = 0;

  const resultSuppliers = suppliers.map((sup, idx) => {
    const sRecords = srBySupplier.get(sup.id) || [];
    const sTrans = stBySupplier.get(sup.id) || [];
    const statement = buildSupplierStatementTimeline(sup, sRecords, sTrans);

    let purchases = statement.total_purchases;
    let returns = statement.total_returns;
    let paid = statement.total_paid;
    let balance = statement.balance;

    const hasLegacyData = Number(sup.total_purchases) > 0 || Number(sup.total_paid) > 0 || Number(sup.balance) !== 0;
    if (!startDate && !endDate && !branchId && statement.items.length === 0 && hasLegacyData) {
      purchases = Number(sup.total_purchases || 0);
      paid = Number(sup.total_paid || 0);
      balance = (purchases > 0 || paid > 0)
        ? Math.round((purchases - paid) * 100) / 100
        : Math.round(-Number(sup.balance || 0) * 100) / 100;
    }

    grandTotalPurchases += purchases;
    grandTotalReturns += returns;
    grandTotalPaid += paid;
    grandTotalBalance += balance;

    return {
      serial: idx + 1,
      id: sup.id,
      name: sup.name,
      code: sup.code || String(sup.id),
      phone: sup.phone || '',
      extra_phone: sup.extra_phone || '',
      company_name: sup.company_name || sup.company || '',
      gender_category: sup.gender_category || 'both',
      address: sup.address || '',
      notes: sup.notes || '',
      total_purchases: Math.round(purchases * 100) / 100,
      total_returns: Math.round(returns * 100) / 100,
      total_paid: Math.round(paid * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      balance_type: balance > 0 ? 'دائن (له)' : (balance < 0 ? 'مدين (عليه)' : 'خالص'),
      transaction_count: statement.items.length,
      transactions: statement.items,
      statement_items: statement.items,
    };
  });

  grandTotalPurchases = Math.round(grandTotalPurchases * 100) / 100;
  grandTotalReturns = Math.round(grandTotalReturns * 100) / 100;
  grandTotalPaid = Math.round(grandTotalPaid * 100) / 100;
  grandTotalBalance = Math.round(grandTotalBalance * 100) / 100;

  return {
    summary: {
      total_suppliers: suppliers.length,
      grand_total_purchases: grandTotalPurchases,
      grand_total_returns: grandTotalReturns,
      grand_total_paid: grandTotalPaid,
      grand_total_payments: grandTotalPaid,
      grand_total_balance: grandTotalBalance,
      current_balance: grandTotalBalance,
      grand_total_balance_type: grandTotalBalance > 0 ? 'دائن (له)' : (grandTotalBalance < 0 ? 'مدين (عليه)' : 'خالص'),
      branch_id: branchId,
      period: startDate && endDate
        ? `${startDate} إلى ${endDate}`
        : (startDate ? `من ${startDate}` : (endDate ? `حتى ${endDate}` : 'كافة الفترات (تراكمي)')),
    },
    suppliers: resultSuppliers,
  };
}

module.exports = {
  getSupplierOptions,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listSupplyRecords,
  createSupplyRecord,
  bulkRestock,
  createSupplierTransaction,
  processSupplierReturn,
  getSupplierStatement,
  getSuppliersLedger,
};
