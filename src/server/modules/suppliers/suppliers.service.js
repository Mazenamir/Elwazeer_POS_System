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
  if (query.gender_category) {
    params.push(query.gender_category);
    where.push(`s.gender_category = $${params.length}`);
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
    COALESCE(SUM(s.balance) FILTER (WHERE s.gender_category = 'رجالي'), 0)::numeric as total_men_balance,
    COALESCE(SUM(s.balance) FILTER (WHERE s.gender_category = 'حريمي'), 0)::numeric as total_women_balance
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
      moq || 0, lead_time || 0, rating || 5, notes, status || 'active', logo_url, supply_type, gender_category || 'مشترك',
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
      gender_category || null, id,
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

async function listSupplyRecords(req) {
  const pagination = parsePagination(req, 50, 200, true);
  let query = `
    SELECT sr.*, s.name as supplier_name, i.name as inventory_name, i.category as inventory_category, b.name as branch_name
    FROM supply_records sr
    JOIN suppliers s ON sr.supplier_id = s.id
    JOIN inventory i ON sr.inventory_id = i.id
    LEFT JOIN branches b ON sr.branch_id = b.id
    ORDER BY sr.supply_date DESC
  `;

  if (pagination.enabled) {
    const params = [];
    query = appendPagination(query, params, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(query, params),
      db.query('SELECT COUNT(*)::int as total FROM supply_records'),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
  }

  const { rows } = await db.query(query);
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

async function createSupplierTransaction(payload) {
  const { supplier_id, transaction_type, amount, notes } = payload;
  const safeAmount = Number(amount);
  if (!supplier_id || !Number.isFinite(safeAmount) || safeAmount <= 0) {
    const err = new Error('مبلغ الدفعة يجب أن يكون أكبر من صفر');
    err.statusCode = 400;
    throw err;
  }

  await db.transaction(async (tx) => {
    await tx.query(
      'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes) VALUES ($1, $2, $3, $4)',
      [supplier_id, transaction_type, safeAmount, notes]
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

async function getSupplierStatement(id, requestedLimit = null) {
  const parsedLimit = Number.parseInt(requestedLimit, 10);
  const statementLimit = Math.min(
    Math.max(Number.isInteger(parsedLimit) ? parsedLimit : config.SUPPLIER_STATEMENT_LIMIT, 10),
    config.SUPPLIER_STATEMENT_LIMIT
  );

  const supplierRes = await db.query('SELECT * FROM suppliers WHERE id = $1', [id]);
  if (supplierRes.rows.length === 0) {
    const err = new Error('Supplier not found');
    err.statusCode = 404;
    throw err;
  }
  const supplier = supplierRes.rows[0];

  // Fetch transactions (payments & standalone purchases without batch)
  const transactionsRes = await db.query(`
    SELECT id, supplier_id, transaction_type, amount, notes, transaction_date, purchase_batch_id
    FROM supplier_transactions
    WHERE supplier_id = $1
    ORDER BY transaction_date DESC, id DESC
    LIMIT $2
  `, [id, statementLimit]);

  // Fetch supply records grouped by batch
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
    ORDER BY sr.supply_date DESC, sr.id DESC
    LIMIT $2
  `, [id, statementLimit]);

  // Group supply records by purchase_batch_id
  const purchaseBatchMap = new Map();
  const returnItemsByBatchAndTransactionId = new Map();

  for (const row of supplyRecordsRes.rows) {
    const isReturn = Number(row.quantity) < 0;

    if (isReturn) {
      const rtnMatch = row.notes && row.notes.match(/\[RTN-(\d+)\]/);
      const returnTransactionId = rtnMatch ? rtnMatch[1] : null;

      if (returnTransactionId && row.purchase_batch_id) {
        const compositeKey = `${row.purchase_batch_id}-RTN-${returnTransactionId}`;

        if (!returnItemsByBatchAndTransactionId.has(compositeKey)) {
          returnItemsByBatchAndTransactionId.set(compositeKey, {
            batch_id: row.purchase_batch_id,
            return_transaction_id: returnTransactionId,
            supply_date: row.supply_date,
            branch_name: row.branch_name || '',
            items: [],
            total_qty: 0,
            total_cost: 0,
          });
        }

        const returnBatch = returnItemsByBatchAndTransactionId.get(compositeKey);
        if (new Date(row.supply_date) > new Date(returnBatch.supply_date)) {
          returnBatch.supply_date = row.supply_date;
        }
        returnBatch.items.push(row);
        returnBatch.total_qty += Math.abs(Number(row.quantity || 0));
        returnBatch.total_cost += Math.abs(Number(row.total_cost || 0));
      }
    } else {
      const key = row.purchase_batch_id || `solo-${row.id}`;

      if (!purchaseBatchMap.has(key)) {
        purchaseBatchMap.set(key, {
          batch_id: row.purchase_batch_id || null,
          supply_date: row.supply_date,
          branch_name: row.branch_name || '',
          items: [],
          total_qty: 0,
          total_cost: 0,
        });
      }

      const batch = purchaseBatchMap.get(key);
      if (new Date(row.supply_date) > new Date(batch.supply_date)) {
        batch.supply_date = row.supply_date;
      }
      batch.items.push(row);
      batch.total_qty += Math.abs(Number(row.quantity || 0));
      batch.total_cost += Math.abs(Number(row.total_cost || 0));
    }
  }

  // Build ledger: merge transactions + batched purchases into one timeline
  const ledger = [];
  const seenPurchaseBatchIds = new Set();

  const purchaseBatchByBatchId = new Map();
  for (const [, batch] of purchaseBatchMap.entries()) {
    if (batch.batch_id) purchaseBatchByBatchId.set(batch.batch_id, batch);
  }

  const returnBatchByCompositeKey = new Map();
  for (const [compositeKey, batch] of returnItemsByBatchAndTransactionId.entries()) {
    returnBatchByCompositeKey.set(compositeKey, batch);
  }

  const returnedQtyByBatchAndInventory = new Map();
  for (const [, returnBatch] of returnItemsByBatchAndTransactionId.entries()) {
    const batchId = returnBatch.batch_id;

    if (!returnedQtyByBatchAndInventory.has(batchId)) {
      returnedQtyByBatchAndInventory.set(batchId, new Map());
    }

    const inventoryReturnsMap = returnedQtyByBatchAndInventory.get(batchId);

    for (const item of returnBatch.items) {
      const inventoryId = item.inventory_id;
      const returnedQty = Math.abs(Number(item.quantity));

      if (!inventoryReturnsMap.has(inventoryId)) {
        inventoryReturnsMap.set(inventoryId, 0);
      }

      inventoryReturnsMap.set(inventoryId, inventoryReturnsMap.get(inventoryId) + returnedQty);
    }
  }

  for (const trans of transactionsRes.rows) {
    if (trans.transaction_type === 'purchase' && trans.purchase_batch_id && purchaseBatchByBatchId.has(trans.purchase_batch_id)) {
      if (seenPurchaseBatchIds.has(trans.purchase_batch_id)) continue;
      seenPurchaseBatchIds.add(trans.purchase_batch_id);

      const batch = purchaseBatchByBatchId.get(trans.purchase_batch_id);
      const inventoryReturnsMap = returnedQtyByBatchAndInventory.get(trans.purchase_batch_id) || new Map();

      const updatedItems = batch.items.map((item) => {
        const originalQty = Math.abs(Number(item.quantity));
        const returnedQty = inventoryReturnsMap.get(item.inventory_id) || 0;
        const remainingQty = originalQty - returnedQty;

        return {
          ...item,
          original_quantity: originalQty,
          returned_quantity: returnedQty,
          remaining_quantity: remainingQty,
          remaining_total_cost: remainingQty * Number(item.cost_price),
        };
      });

      const remainingTotalQty = updatedItems.reduce((sum, item) => sum + item.remaining_quantity, 0);
      const remainingTotalCost = updatedItems.reduce((sum, item) => sum + item.remaining_total_cost, 0);

      ledger.push({
        ...trans,
        amount: remainingTotalCost,
        original_amount: batch.total_cost,
        is_batched_purchase: true,
        batch_items: updatedItems,
        batch_total_qty: remainingTotalQty,
        original_batch_total_qty: batch.total_qty,
        batch_branch_name: batch.branch_name,
      });
    } else if (trans.transaction_type === 'return' && trans.purchase_batch_id) {
      const compositeKey = `${trans.purchase_batch_id}-RTN-${trans.id}`;

      if (returnBatchByCompositeKey.has(compositeKey)) {
        const returnBatch = returnBatchByCompositeKey.get(compositeKey);

        ledger.push({
          ...trans,
          amount: returnBatch.total_cost,
          is_batched_purchase: true,
          batch_items: returnBatch.items,
          batch_total_qty: returnBatch.total_qty,
          batch_branch_name: returnBatch.branch_name,
        });
      } else {
        ledger.push({
          ...trans,
          is_batched_purchase: false,
          batch_items: [],
        });
      }
    } else {
      ledger.push({
        ...trans,
        is_batched_purchase: false,
        batch_items: [],
      });
    }
  }

  return {
    supplier,
    transactions: ledger,
    purchases: supplyRecordsRes.rows,
    summary: {
      total_purchases: supplier.total_purchases || 0,
      total_paid: supplier.total_paid || 0,
      balance: supplier.balance || 0,
    },
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
};
